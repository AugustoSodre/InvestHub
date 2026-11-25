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

/** `require("process")` or `require("node:process")`. */
const isRequireOfProcess = (node) =>
  node.type === "CallExpression" &&
  node.callee.type === "Identifier" &&
  node.callee.name === "require" &&
  node.arguments[0]?.type === "Literal" &&
  PROCESS_MODULES.has(node.arguments[0].value);

/** @type {import("eslint").Rule.RuleModule} */
const noProcessEnv = {
  meta: {
    type: "problem",
    messages: {
      env: "Read environment variables only in src/shared/env.ts (serverEnv()), which validates them and is server-only. Domain code takes config as arguments.",
      alias:
        "Don't bind the process object to another name or load it dynamically: it hides process.env reads from lint. Use process.<member> directly.",
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
        GLOBAL_OBJECTS.has(node.object.name)) ||
      isRequireOfProcess(node);

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
      ImportExpression(node) {
        if (node.source.type === "Literal" && PROCESS_MODULES.has(node.source.value)) {
          context.report({ node, messageId: "alias" });
        }
      },
      MemberExpression(node) {
        if (isProcess(node.object) && propertyName(node) === "env") {
          context.report({ node, messageId: "env" });
        }
      },
      VariableDeclarator(node) {
        if (!node.init || !isProcess(node.init)) return;
        // `const p = process` would let `p.env` through.
        if (node.id.type === "Identifier") {
          context.report({ node, messageId: "alias" });
          return;
        }
        if (node.id.type !== "ObjectPattern") return;
        const takesEnv = node.id.properties.some(
          (p) => p.type === "Property" && !p.computed && (p.key.name ?? p.key.value) === "env",
        );
        if (takesEnv) context.report({ node, messageId: "env" });
      },
    };
  },
};

const NUMBER_CONVERTERS = new Set(["Number", "parseFloat", "parseInt"]);
// Members of Number that read or test a number without converting a string.
const SAFE_NUMBER_MEMBERS = new Set([
  "isFinite",
  "isInteger",
  "isNaN",
  "isSafeInteger",
  "EPSILON",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "MAX_VALUE",
  "MIN_VALUE",
  "NaN",
  "NEGATIVE_INFINITY",
  "POSITIVE_INFINITY",
]);

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

    /**
     * `node` evaluates to the global Number, parseFloat or parseInt. Only reading
     * a safe member such as `Number.isFinite` is allowed; anything else (a call,
     * a callback, an alias, a destructure) can convert a string.
     */
    function checkConverter(node, name) {
      const parent = node.parent;
      const readsSafeMember =
        name === "Number" &&
        parent.type === "MemberExpression" &&
        parent.object === node &&
        SAFE_NUMBER_MEMBERS.has(propertyName(parent));
      if (!readsSafeMember) report(node);
    }

    return {
      "Program:exit"(program) {
        const globalScope = context.sourceCode.getScope(program);
        const globals = [...NUMBER_CONVERTERS];
        // Declared globals hold their references; undeclared ones fall through.
        const references = new Set([
          ...globals.flatMap((name) => globalScope.set.get(name)?.references ?? []),
          ...globalScope.through.filter((ref) => NUMBER_CONVERTERS.has(ref.identifier.name)),
        ]);
        for (const ref of references) {
          // TypeScript type positions such as `x: Number` convert nothing.
          if (ref.isValueReference === false) continue;
          checkConverter(ref.identifier, ref.identifier.name);
        }
      },
      // globalThis.Number(x), window.parseInt(x), globalThis["parseFloat"](x).
      MemberExpression(node) {
        const name = propertyName(node);
        if (
          NUMBER_CONVERTERS.has(name) &&
          node.object.type === "Identifier" &&
          GLOBAL_OBJECTS.has(node.object.name)
        ) {
          checkConverter(node, name);
        }
      },
      // Unary plus converts like Number(); `+1` on a numeric literal is harmless.
      "UnaryExpression[operator='+']"(node) {
        const { argument } = node;
        if (!(argument.type === "Literal" && typeof argument.value === "number")) report(node);
      },
      "CallExpression[callee.type='MemberExpression']"(node) {
        const callee = node.callee;
        // decimal.js's own escape hatch: Decimal#toNumber().
        if (propertyName(callee) === "toNumber") report(callee);
        // zod's z.coerce.number() runs Number() on its input.
        if (
          propertyName(callee) === "number" &&
          callee.object.type === "MemberExpression" &&
          propertyName(callee.object) === "coerce"
        ) {
          report(callee);
        }
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
