import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tailwind from "eslint-plugin-tailwindcss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	...compat.extends("next/core-web-vitals", "next/typescript"),
	{
		plugins: {
			tailwindcss: tailwind,
		},
		settings: {
			tailwindcss: {
				// 通过提供静态对象，阻止插件尝试加载 tailwind.config.js 或调用 v4 崩溃的 API
				config: {
					content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
					theme: { extend: {} },
				},
				callees: ["cn", "cva", "ctl", "twMerge", "clsx"],
			},
		},
		rules: {
			"tailwindcss/no-arbitrary-value": "error",
		},
	},
];

export default eslintConfig;
