/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 关掉开发期的悬浮指示器，避免它出现在证据截图里
  devIndicators: false,
  // node:sqlite 是 Node 内置模块，交给运行时解析，不打进 bundle
  serverExternalPackages: [],
  webpack: (config) => {
    config.externals = config.externals || []
    config.externals.push('node:sqlite')
    return config
  }
}

export default nextConfig
