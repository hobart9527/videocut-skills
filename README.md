# Videocut

> 口播视频智能剪辑 CLI 工具 — 火山引擎转录 + 规则分析 + 多模式审核 + FFmpeg 精确剪辑

支持两种使用方式：
- **CLI 工具**：独立运行，不依赖 Claude Code
- **Claude Code Skill**：通过 `/videocut` 调用（保留向后兼容）

## 为什么做这个？

剪映的"智能剪口播"有两个痛点：
1. **无法理解语义**：重复说的句子、说错后纠正的内容，它识别不出来
2. **字幕质量差**：专业术语（Claude Code、MCP、API）经常识别错误

这个工具用规则引擎分析口误，用自定义词典解决术语识别，支持多种审核模式。

## 效果演示

**输入**：19 分钟口播原片（各种口误、卡顿、重复）

**输出**：
- 自动识别 600+ 处问题（静音、口误、重复、卡顿）
- 剪辑后视频大幅精简
- 支持 web/TUI/auto/report 四种审核模式

## 核心功能

| 功能 | 说明 | 对比剪映 |
|------|------|----------|
| **静音检测** | >0.3s 自动标记，阈值可调 | 固定阈值 |
| **语气词过滤** | 嗯、啊、呃等 standalone 检测 | 只能模式匹配 |
| **重复句检测** | 相邻句开头≥5字相同 → 删前保后 | 无此功能 |
| **卡顿词检测** | "那个那个"、"就是就是" → 删重复部分 | 无此功能 |
| **残句检测** | 短句被完整句包含 → 删除短句 | 无此功能 |
| **重说纠正** | "A...不对...B" → 删除 A 部分 | 无此功能 |
| **词典纠错** | 自定义专业术语词典 | 无此功能 |
| **多模式审核** | web 浏览器 / TUI 终端 / auto 自动 / report 报告 | 仅内置 |

## 安装

### 方式一：npm 全局安装（推荐）

```bash
npm install -g videocut-skills
```

### 方式二：从源码安装

```bash
git clone https://github.com/hobart9527/videocut-skills.git
cd videocut-skills
npm install
npm link
```

### 依赖检查

```bash
videocut doctor
```

需要：
- **Node.js 18+**
- **FFmpeg** (`brew install ffmpeg`)
- **火山引擎 API Key**（或其他 ASR 服务）

## 配置

### 火山引擎（默认）

```bash
videocut config set asr.provider volcengine
videocut config set asr.volcengine.apiKey <your-api-key>
```

### 自定义云端 ASR

支持任何符合 submit + poll 模式的 ASR 服务：

```bash
videocut config set asr.provider cloud
videocut config set asr.cloud.baseURL https://api.example.com/v1
videocut config set asr.cloud.apiKey <your-api-key>
videocut config set asr.cloud.apiKeyHeader x-api-key
videocut config set asr.cloud.taskIdPath id
videocut config set asr.cloud.resultPath utterances
# ... 其他字段按需配置
```

### 查看全部配置

```bash
videocut config list
```

## 使用流程

### 1. 剪口播（完整流程）

```bash
# web 审核模式（推荐）
videocut cut video.mp4 --review web

# 终端审核模式（无浏览器）
videocut cut video.mp4 --review tui

# 自动模式（直接按 AI 建议剪辑）
videocut cut video.mp4 --review auto

# 仅生成报告（不剪辑）
videocut cut video.mp4 --review report
```

流程：
1. 提取音频 → 上传到 ASR 服务
2. 获取字级别时间戳 → `subtitles_words.json`
3. 规则分析：静音 / 口误 / 重复 / 卡顿 / 残句
4. 进入审核界面确认删除片段
5. FFmpeg filter_complex 精确剪辑

### 2. 仅转录

```bash
videocut transcribe video.mp4 -o subtitles_words.json
```

### 3. 生成字幕

```bash
videocut subtitle video.mp4

# 使用已有的 SRT 文件
videocut subtitle video.mp4 --srt existing.srt
```

### 4. 高清导出

```bash
videocut hd video.mp4

# 自定义输出路径和码率
videocut hd video.mp4 -o output_hd.mp4 --multiplier 1.5
```

### 5. 启动审核服务器（独立使用）

```bash
videocut review -p 8899 -d ./output
```

## CLI 命令清单

```
Usage: videocut [options] [command]

Commands:
  config [action] [key] [value]   管理配置 (get/set/list)
  cut [options] <video>           转录 → 分析 → 审核 → 剪辑
  transcribe [options] <video>    仅转录音频
  review [options]                启动审核服务器
  subtitle [options] <video>      生成并烧录字幕
  hd [options] <video>            2-pass 高清导出
  doctor                          检查环境依赖
```

### Cut 命令选项

```
-o, --output <dir>     输出目录
-r, --review <mode>    审核模式: web|tui|auto|report (默认: web)
-t, --threshold <s>    静音阈值，单位秒 (默认: 0.3)
-p, --port <port>      审核服务器端口 (默认: 8899)
--asr <provider>       ASR 供应商: cloud|volcengine|whisper
--no-upload            跳过音频上传，使用本地文件路径
```

## 目录结构

```
videocut/
├── bin/
│   └── videocut              # CLI 入口
├── src/
│   ├── asr/                  # ASR 抽象层
│   │   ├── base.js           # Provider 基类
│   │   ├── cloud.js          # 通用云端 ASR
│   │   ├── volcengine.js     # 火山引擎预设
│   │   ├── whisper.js        # 本地 Whisper (stub)
│   │   └── index.js          # Provider 工厂
│   ├── core/                 # 核心流程
│   │   ├── analyze.js        # 规则分析引擎
│   │   ├── cut.js            # 完整剪辑流程
│   │   ├── transcribe.js     # 转录 + gap 标记
│   │   ├── subtitle.js       # 字幕生成与烧录
│   │   └── hd.js             # 高清导出
│   ├── review/               # 审核系统
│   │   ├── web.js            # 浏览器审核 (Web Audio + 206)
│   │   ├── tui.js            # 终端审核
│   │   └── report.js         # 静态报告
│   ├── utils/                # 工具函数
│   │   ├── ffmpeg.js         # FFmpeg 封装
│   │   └── file.js           # 文件管理
│   └── config.js             # ~/.videocut/config.json 配置管理
├── package.json
├── 字幕/词典.txt              # 自定义术语词典
├── 剪口播/用户习惯/           # 审核规则文档（可自定义）
└── README.md
```

## 技术架构

```
┌──────────────────┐     ┌──────────────────┐
│   ASR Provider   │────▶│  字级别时间戳    │
│  (volcengine/    │     │  subtitles_words │
│   cloud/whisper) │     │     .json        │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│  Rule Engine     │────▶│   分析问题列表   │
│  (analyze.js)    │     │  auto_selected   │
│  · silence       │     └────────┬─────────┘
│  · filler        │                │
│  · stutter       │                ▼
│  · repeat        │     ┌──────────────────┐
│  · incomplete    │────▶│   审核界面       │
│  · correction    │     │  web/tui/auto/   │
└──────────────────┘     │     report       │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   delete list    │
                         │  (user confirmed)│
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │    FFmpeg        │
                         │ filter_complex   │
                         │ trim + acrossfade│
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   剪辑后视频     │
                         │   xxx_cut.mp4    │
                         └──────────────────┘
```

## ASR 配置示例

### 火山引擎（默认预设）

```json
{
  "asr": {
    "provider": "volcengine",
    "volcengine": {
      "apiKey": "your-key",
      "language": "zh-CN",
      "useItn": true,
      "useCapitalize": true
    }
  }
}
```

### 自定义云端服务

```json
{
  "asr": {
    "provider": "cloud",
    "cloud": {
      "baseURL": "https://api.example.com/v1",
      "apiKey": "your-key",
      "apiKeyHeader": "Authorization",
      "language": "zh-CN",
      "submitPath": "/submit",
      "queryPath": "/query",
      "pollInterval": 5000,
      "maxAttempts": 120,
      "successCode": 0,
      "taskIdPath": "id",
      "resultPath": "utterances",
      "wordsPath": "words",
      "textField": "text",
      "startField": "start_time",
      "endField": "end_time",
      "timeUnit": 1000,
      "uploadService": "uguu"
    }
  }
}
```

## 常见问题

### Q: 火山引擎转录超时？

上传音频默认使用 uguu.se，失败会自动回退到 file.io。如需跳过上传：

```bash
videocut cut video.mp4 --no-upload
```

### Q: 审核网页打不开？

检查端口是否被占用，或指定其他端口：

```bash
videocut cut video.mp4 --review web -p 9090
```

### Q: 剪辑后音画不同步？

使用 `filter_complex + trim + acrossfade` 而非 `concat demuxer`，已内置处理。

### Q: 如何添加自定义词典？

编辑 `字幕/词典.txt`，每行一个词：

```
Claude Code
MCP
API
```

### Q: 如何切换到其他 ASR？

```bash
# 查看当前 provider
videocut config get asr.provider

# 切换到自定义云端服务
videocut config set asr.provider cloud

# 或使用本地 Whisper（需先安装）
videocut config set asr.provider whisper
```

## License

MIT
