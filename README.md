# Image Search MCP

基于 Bing 图片搜索的 MCP Server，支持关键词搜索图片并下载到本地。适用于 Claude Desktop、Cursor 等 MCP 客户端。

## 功能特性

- 根据关键词从 Bing 搜索图片，返回结构化结果（URL、缩略图、尺寸、来源页面）
- 自动下载图片到本地目录，按分辨率降序排列
- 图片过滤：跳过 SVG、过小图片（宽或高 < 200px）
- URL 去重，避免重复下载
- 并发下载，支持错误重试
- 零成本，无需 API Key

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **协议**: Model Context Protocol (MCP)，stdio 传输
- **HTML 解析**: cheerio
- **尺寸检测**: 从文件头字节解析（支持 JPEG、PNG、GIF、WebP）

## 快速开始

### 1. 安装依赖

```bash
cd image-search-mcp
bun install
```

### 2. 启动服务

```bash
bun start
```

### 3. 配置 MCP 客户端

将以下配置添加到你的 MCP 客户端配置文件中：

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`)：

```json
{
  "mcpServers": {
    "image-search": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/image-search-mcp/src/index.ts"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`)：

```json
{
  "mcpServers": {
    "image-search": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/image-search-mcp/src/index.ts"]
    }
  }
}
```

> 将 `/absolute/path/to/image-search-mcp` 替换为项目的实际绝对路径。

## 工具说明

### search_images

根据关键词搜索 Bing 图片，返回图片列表及元数据。

**参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| keyword | string | 是 | - | 搜索关键词 |
| count | number | 否 | 5 | 返回结果数量 |

**返回值** (`structuredContent`)：

```json
{
  "images": [
    {
      "url": "https://example.com/image.jpg",
      "thumbnailUrl": "https://ts.mm.bing.net/th?id=...",
      "width": 1920,
      "height": 1080,
      "sourcePage": "https://example.com/page"
    }
  ],
  "total": 5
}
```

| 字段 | 说明 |
|------|------|
| url | 原图 URL |
| thumbnailUrl | Bing 缩略图 URL |
| width | 图片宽度（像素），通过文件头解析获取 |
| height | 图片高度（像素），通过文件头解析获取 |
| sourcePage | 来源网页 URL |
| total | 返回结果总数 |

### download_images

根据关键词搜索图片，过滤后下载到本地目录。

**参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| keyword | string | 是 | - | 搜索关键词 |
| count | number | 否 | 5 | 下载数量 |
| save_dir | string | 否 | `"images"` | 保存目录 |

**返回值** (`structuredContent`)：

```json
{
  "downloaded": [
    {
      "filePath": "/path/to/images/keyword/keyword_1.jpg",
      "width": 2880,
      "height": 1800
    }
  ],
  "failed": [
    {
      "filePath": "/path/to/images/keyword/keyword_3.jpg",
      "error": "timeout"
    }
  ],
  "saveDirectory": "/path/to/images"
}
```

| 字段 | 说明 |
|------|------|
| downloaded | 成功下载的图片列表，包含本地路径和尺寸 |
| failed | 下载失败的图片列表，包含错误信息 |
| saveDirectory | 图片保存的根目录 |

**下载规则**：

- 自动创建子目录：`{save_dir}/{keyword}/`
- 文件命名：`{keyword}_1.jpg`、`{keyword}_2.jpg`...
- 按分辨率（宽 x 高）降序排列，优先保存高分辨率图片
- 过滤掉宽度或高度 < 200px 的图片
- 跳过 SVG 格式
- 单张图片下载失败不影响其他图片

## 项目结构

```
image-search-mcp/
├── package.json
├── tsconfig.json
├── mcp-config.example.json       # MCP 客户端配置示例
├── src/
│   ├── index.ts                  # MCP Server 入口，注册工具
│   ├── bing-search.ts            # Bing 图片搜索（HTML 爬取 + 解析）
│   ├── image-downloader.ts       # 图片下载、尺寸检测、过滤排序
│   └── types.ts                  # 类型定义和常量
└── openspec/                     # 变更管理文档
```

## 开发

```bash
# 开发模式（文件变更自动重启）
bun dev

# 手动测试 MCP 握手
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | bun start
```

## 注意事项

- 本项目通过爬取 Bing 图片搜索页面获取结果，不使用官方 API
- Bing 可能限制请求频率或更改页面结构，如遇搜索失败可稍后重试
- 搜索结果中的图片尺寸通过 HTTP Range 请求获取文件头解析，少数服务器可能不支持 Range 请求
- 下载的图片受原网站版权保护，请合理使用

## 免责声明

本项目仅供学习和研究使用，使用者需自行承担以下责任：

- **版权**：搜索和下载的图片版权归原作者或网站所有，本项目不拥有任何图片的版权。使用者应遵守相关版权法律法规，不得将下载的图片用于商业用途或侵犯他人知识产权。
- **使用风险**：本项目通过爬取 Bing 搜索页面获取图片链接，可能违反 Bing 的服务条款。使用者需自行评估并承担由此产生的法律风险，开发者不承担任何责任。
- **内容合规**：搜索结果的内容和准确性由 Bing 搜索引擎决定，开发者不对搜索结果的真实性、合法性或适用性做任何保证。
- **无担保**：本项目按"原样"提供，不做任何明示或暗示的担保，包括但不限于适销性和特定用途的适用性。

使用本项目即表示你已阅读并同意以上声明。
