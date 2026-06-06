# Image Search MCP

一个基于 Model Context Protocol (MCP) 的图片搜索与下载服务。当前版本提供统一工具 `image_search`，可从 Pexels、Pixabay、Unsplash 和 Bing 搜索图片；配置了 API Key 的 provider 会参与搜索，未配置的 provider 会自动跳过，Bing 作为无需 API Key 的兜底来源。

适用于 Claude Desktop、Cursor 等支持 MCP stdio 的客户端。

## 功能特性

- 单一 MCP 工具 `image_search`：通过 `save_dir` 参数区分“只搜索”和“搜索并下载”两种模式
- 多图片源并发搜索：Pexels、Pixabay、Unsplash、Bing
- 缺少 API Key 时自动跳过对应 provider，并在 `diagnostics` 中返回状态
- 统一结果格式：provider、标题/描述、下载 URL、尺寸、来源页面
- 结果排序：URL/来源去重、orientation 过滤、相关性评分、provider 优先级、分辨率加权
- 本地下载：自动创建目录，跳过过小图片，单张失败不影响后续候选
- 轻量尺寸检测：从文件头解析 JPEG、PNG、GIF、WebP 尺寸

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **协议**: Model Context Protocol (MCP)，stdio 传输
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **HTML 解析**: `cheerio`，用于 Bing 图片页面解析
- **测试**: Bun 内置 `bun:test`

## 快速开始

### 1. 安装依赖

```bash
cd image-search-mcp
bun install
```

### 2. 可选：配置图片源 API Key

Pexels、Pixabay、Unsplash 是可选增强来源；不配置时仍可使用 Bing 兜底。

```bash
export PEXELS_API_KEY="your-pexels-key"
export PIXABAY_API_KEY="your-pixabay-key"
export UNSPLASH_ACCESS_KEY="your-unsplash-access-key"
```

> 不要把真实 API Key 写入仓库文件或提交到 Git。建议通过 MCP 客户端的 `env` 配置或本机 shell 环境变量注入。

### 3. 启动服务

```bash
bun start
```

开发模式可使用：

```bash
bun dev
```

### 4. 配置 MCP 客户端

将以下配置添加到 MCP 客户端配置文件中，并把路径替换为本机绝对路径。

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`)：

```json
{
  "mcpServers": {
    "image-search": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/image-search-mcp/src/index.ts"],
      "env": {
        "PEXELS_API_KEY": "your-pexels-key",
        "PIXABAY_API_KEY": "your-pixabay-key",
        "UNSPLASH_ACCESS_KEY": "your-unsplash-access-key"
      }
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
      "args": ["run", "/absolute/path/to/image-search-mcp/src/index.ts"],
      "env": {
        "PEXELS_API_KEY": "your-pexels-key",
        "PIXABAY_API_KEY": "your-pixabay-key",
        "UNSPLASH_ACCESS_KEY": "your-unsplash-access-key"
      }
    }
  }
}
```

如果只想使用 Bing 兜底，可以删除 `env` 字段。

## 工具说明

### image_search

统一图片搜索工具。传入 `save_dir` 时会下载图片；不传 `save_dir` 时只返回 URL 和元数据。

**参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | 是 | - | 搜索关键词 |
| `count` | number | 否 | 5 | 期望返回或下载的图片数量，范围 1-20 |
| `save_dir` | string | 否 | - | 保存目录；传入后启用下载模式 |
| `orientation` | string | 否 | - | 图片方向：`landscape`、`portrait`、`squarish` |

### 只搜索模式

不传 `save_dir` 时，工具返回文本摘要和 `structuredContent.results`。

示例调用参数：

```json
{
  "query": "mountain lake sunrise",
  "count": 3,
  "orientation": "landscape"
}
```

示例返回结构：

```json
{
  "results": [
    {
      "provider": "pexels",
      "title": "Mountain lake at sunrise",
      "description": "Mountain lake at sunrise",
      "downloadUrl": "https://images.pexels.com/photos/.../original.jpg",
      "width": 6000,
      "height": 4000,
      "sourcePage": "https://www.pexels.com/photo/..."
    }
  ],
  "diagnostics": {
    "pexels": { "status": "ok", "count": 3 },
    "pixabay": { "status": "skipped", "count": 0, "error": "PIXABAY_API_KEY not configured" },
    "unsplash": { "status": "skipped", "count": 0, "error": "Missing UNSPLASH_ACCESS_KEY environment variable" },
    "bing": { "status": "ok", "count": 2 }
  }
}
```

### 下载模式

传入 `save_dir` 时，工具会先搜索更多候选，再下载排序后的图片。

示例调用参数：

```json
{
  "query": "mountain lake sunrise",
  "count": 3,
  "save_dir": "images",
  "orientation": "landscape"
}
```

示例返回结构：

```json
{
  "directory": "images/mountain_lake_sunrise",
  "downloaded": [
    {
      "filePath": "images/mountain_lake_sunrise/mountain_lake_sunrise_pexels_1.jpeg",
      "provider": "pexels",
      "width": 6000,
      "height": 4000
    }
  ],
  "failed": [
    {
      "provider": "bing",
      "downloadUrl": "https://example.com/broken.jpg",
      "error": "HTTP 403"
    }
  ],
  "results": [
    {
      "provider": "pexels",
      "title": "Mountain lake at sunrise",
      "description": "Mountain lake at sunrise",
      "downloadUrl": "https://images.pexels.com/photos/.../original.jpg",
      "width": 6000,
      "height": 4000,
      "sourcePage": "https://www.pexels.com/photo/..."
    }
  ],
  "diagnostics": {
    "pexels": { "status": "ok", "count": 12 },
    "pixabay": { "status": "skipped", "count": 0, "error": "PIXABAY_API_KEY not configured" },
    "unsplash": { "status": "skipped", "count": 0, "error": "Missing UNSPLASH_ACCESS_KEY environment variable" },
    "bing": { "status": "ok", "count": 6 }
  }
}
```

**下载规则**：

- 自动创建子目录：`{save_dir}/{清洗后的 query}/`
- 文件命名：`{清洗后的 query}_{provider}_{序号}.{ext}`
- 下载候选来自统一排序后的搜索结果
- 图片尺寸低于 200px 时会跳过
- 非图片响应、HTTP 错误、文件过小等会进入 `failed`
- 单张图片失败不会中断整体下载流程

## Provider 说明

| Provider | API Key | 环境变量 | 说明 |
|----------|---------|----------|------|
| Pexels | 需要 | `PEXELS_API_KEY` | 优先级最高，返回较高质量的摄影图片 |
| Pixabay | 需要 | `PIXABAY_API_KEY` | 支持 tags、作者、Pixabay license 元数据 |
| Unsplash | 需要 | `UNSPLASH_ACCESS_KEY` | 使用 Unsplash Search Photos API |
| Bing | 不需要 | - | 通过 HTML 页面解析获取结果，作为兜底来源 |

Provider 状态会通过 `diagnostics` 返回：

- `ok`：provider 成功返回结果
- `skipped`：通常是缺少 API Key
- `error`：请求失败、超时或接口返回错误

## 项目结构

```text
image-search-mcp/
├── package.json
├── tsconfig.json
├── mcp-config.example.json          # MCP 客户端配置示例
├── src/
│   ├── index.ts                     # MCP Server 入口，注册 image_search
│   ├── types.ts                     # 统一类型定义和常量
│   ├── bing-search.ts               # Bing 图片 HTML 爬取与结果转换
│   ├── pexels-api.ts                # Pexels provider
│   ├── pixabay-api.ts               # Pixabay provider
│   ├── unsplash-api.ts              # Unsplash provider
│   ├── scoring.ts                   # 去重、orientation 过滤和结果排序
│   ├── serialization.ts             # MCP structuredContent 序列化
│   ├── image-downloader.ts          # 图片下载、尺寸检测和保存
│   └── *.test.ts                    # Bun 测试
└── openspec/                        # OpenSpec 变更文档（如本地保留）
```

## 开发与验证

```bash
# 开发模式（文件变更自动重启）
bun dev

# 类型检查
bunx tsc --noEmit

# 运行测试
bun test
```

手动检查 MCP 握手和工具列表：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | bun start
```

手动调用 `image_search`：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"image_search","arguments":{"query":"mountain lake","count":2}}}' \
  | bun start
```

## 注意事项

- Pexels、Pixabay、Unsplash 使用官方 API，需遵守各自服务条款、配额和授权要求。
- Bing provider 通过页面解析获取结果，页面结构变化或反爬限制可能导致空结果或失败。
- 当前 MCP 工具仅暴露 `orientation` 作为统一筛选项；其他 provider 特有筛选参数未暴露。
- 当前仅注册 `image_search`；旧版 `search_images`、`download_images`、`search_unsplash_photos`、`download_unsplash_photos` 不再提供。
- 下载目录由调用方传入，请避免传入敏感系统目录。
- 下载的图片版权和使用授权取决于原 provider 和来源页面，请在使用前自行确认。

## 免责声明

本项目仅供学习和研究使用，使用者需自行承担以下责任：

- **版权与授权**：搜索和下载的图片版权归原作者或网站所有，本项目不拥有任何图片版权。请遵守 Pexels、Pixabay、Unsplash、Bing 以及原来源网站的授权条款。
- **使用风险**：Bing provider 使用页面解析方式，可能受页面结构、服务条款或访问限制影响。
- **内容合规**：搜索结果由第三方 provider 返回，本项目不保证内容的真实性、合法性、适用性或安全性。
- **无担保**：本项目按“原样”提供，不做任何明示或暗示的担保，包括但不限于适销性和特定用途适用性。

使用本项目即表示你已阅读并同意以上声明。
