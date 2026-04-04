import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

import type { NextConfig } from "next";
import { execSync } from "child_process";

const commitHash = (() => {
	try {
		return execSync("git rev-parse --short HEAD 2>/dev/null").toString().trim();
	} catch {
		return "dev";
	}
})();

const nextConfig: NextConfig = {
	env: {
		NEXT_PUBLIC_COMMIT_HASH: commitHash,
	},
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'avatars.githubusercontent.com',
			},
			{
				protocol: 'https',
				hostname: '**',
			},
		],
	},
};

export default nextConfig;
