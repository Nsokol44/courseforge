/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Anthropic SDK from being bundled client-side
  serverExternalPackages: ['@anthropic-ai/sdk'],
}

module.exports = nextConfig
