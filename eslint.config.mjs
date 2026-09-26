import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: ["public/**", "_legado/**", "apresentacao/**", ".next/**", "node_modules/**", "drizzle/**", "scripts/**", "next-env.d.ts", ".claude/**"] },
  ...nextVitals,
  ...nextTs,
  /* o <Image> do @react-pdf/renderer não tem alt: a regra é para HTML */
  { files: ["lib/pdf/**"], rules: { "jsx-a11y/alt-text": "off" } },
];
export default config;
