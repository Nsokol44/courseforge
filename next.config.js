/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required in Next.js 14.x to prevent Anthropic SDK from being bundled client-side
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
}

module.exports = nextConfig
