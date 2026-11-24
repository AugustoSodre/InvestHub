// ESLint rules for the CLAUDE.md hard rules that a machine can check. Each one
// is its own rule, so eslint.config.mjs can scope them to different files
// without overriding each other's options.

/** Name of a non-computed or string-literal member property, else undefined. */
function propertyName(member) {
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  if (member.property.type === "Literal" && typeof member.property.value === "string") {
    return member.property.value;
  }
  return undefined;
}

const GLOBAL_OBJECTS = new Set(["globalThis", "global", "window", "self"]);
const PROCESS_MODULES = new Set(["process", "node:process"]);

/** @type {import("eslint").Rule.RuleModule} */
const noProcessEnv = {
  meta: {
    type: "problem",
    messages: {
      env: "Read environment variables only in src/shared/env.ts (serverEnv()), which validates them and is server-only. Domain code takes config as arguments.",
    },
    schema: [],
  },
  create(context) {
    // Local names bound to the process module, e.g. `import proc from "node:process"`.
    const processNames = new Set(["process"]);
    const isProcess = (node) =>
      (node.type === "Identifier" && processNames.has(node.name)) ||
      (node.type === "MemberExpression" &&
        propertyName(node) === "process" &&
        node.object.type === "Identifier" &&
        GLOBAL_OBJECTS.has(node.object.name));

    return {
      ImportDeclaration(node) {
        if (!PROCESS_MODULES.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            const imported = specifier.imported.name ?? specifier.imported.value;
            if (imported === "env") context.report({ node: specifier, messageId: "env" });
          } else {
            processNames.add(specifier.local.name);
          }
        }
      },
      MemberExpression(node) {
        if (isProcess(node.object) && propertyName(node) === "env") {
          context.report({ node, messageId: "env" });
        }
      },
      VariableDeclarator(node) {
        if (!node.init || !isProcess(node.init) || node.id.type !== "ObjectPattern") return;
        const takesEnv = node.id.properties.some(
          (p) => p.type === "Property" && !p.computed && (p.key.name ?? p.key.value) === "env",
        );
        if (takesEnv) context.report({ node, messageId: "env" });
      },
    };
  },
};

const PARSE_GLOBALS = new Set(["parseFloat", "parseInt"]);

/** @type {import("eslint").Rule.RuleModule} */
const noNumberParsing = {
  meta: {
    type: "problem",
    messages: {
      parse:
        "Money, prices, quantities, rates and FX are Decimal, never number: wrap strings with toDecimal(). For chart props only, convert with toChartNumber() from src/shared/decimal.ts.",
    },
    schema: [],
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: "parse" });

    /** Is this reference to the global `Number` a conversion? `Number.isFinite` etc. stay allowed. */
    function isNumberConversion(identifier) {
      const parent = identifier.parent;
      if (parent.type === "CallExpression" || parent.type === "NewExpression") {
        // Number(x), new Number(x), or Number passed as a callback: xs.map(Number).
        return parent.callee === identifier || parent.arguments.includes(identifier);
      }
      return (
        parent.type === "MemberExpression" &&
        parent.object === identifier &&
        PARSE_GLOBALS.has(propertyName(parent))
      );
    }

    return {
      "Program:exit"(program) {
        const globalScope = context.sourceCode.getScope(program);
        const globals = ["Number", ...PARSE_GLOBALS];
        // Declared globals hold their references; undeclared ones fall through.
        const references = new Set([
          ...globals.flatMap((name) => globalScope.set.get(name)?.references ?? []),
          ...globalScope.through.filter((ref) => globals.includes(ref.identifier.name)),
        ]);
        for (const { identifier } of references) {
          if (PARSE_GLOBALS.has(identifier.name) || isNumberConversion(identifier)) {
            report(identifier);
          }
        }
      },
      // decimal.js's own escape hatch: Decimal#toNumber().
      "CallExpression[callee.type='MemberExpression']"(node) {
        if (propertyName(node.callee) === "toNumber") report(node.callee);
      },
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const noNextPublic = {
  meta: {
    type: "problem",
    messages: {
      nextPublic:
        "NEXT_PUBLIC_ variables are inlined into the browser bundle. Keys stay server-side: read them through serverEnv() in src/shared/env.ts.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        // Tokens skip comments, so prose about the rule stays allowed.
        for (const token of context.sourceCode.ast.tokens) {
          if (token.value.includes("NEXT_PUBLIC_")) {
            context.report({ loc: token.loc, messageId: "nextPublic" });
          }
        }
      },
    };
  },
};

const hardRules = {
  meta: { name: "investhub-hard-rules" },
  rules: {
    "no-process-env": noProcessEnv,
    "no-number-parsing": noNumberParsing,
    "no-next-public": noNextPublic,
  },
};

export default hardRules;
