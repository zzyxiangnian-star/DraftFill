# 国内主流大模型平台 OpenAI 兼容接口核对表

> **核对原则**：严格基于各模型厂商官方开发者文档、官方控制台规范进行核对；未在官方文档中明确声明支持或未查到的项明确标注“未找到”，绝不臆测。  
> **核对日期**：2026-10-12

| 平台名称 | OpenAI 兼容接口地址 (base_url) | 推荐便宜/快速模型名 | 旗舰模型名 | 支持 GET /models 列模型 | 支持 response_format json_object | 新用户免费额度 | 申请 API Key 页面 | 官方文档网址 | 核对日期 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DeepSeek (深度求索)** | `https://api.deepseek.com` | `deepseek-chat` | `deepseek-reasoner` / `deepseek-chat` | 是（`GET https://api.deepseek.com/models`） | 是（需在 prompt 中包含 "json" 字样） | 注册即送 500 万 Tokens（有效期依控制台显示为准） | [控制台 API Keys](https://platform.deepseek.com/api_keys) | [DeepSeek API 文档](https://api-docs.deepseek.com/) | 2026-10-12 |
| **阿里云百炼 (通义千问)** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` / `qwen-plus` | `qwen-max` | 否（官方文档明确说明兼容端点不提供该接口） | 是（需在 prompt 中包含 "json" 字样；不支持与思维模式同开） | 首次开通各模型赠送 100 万 Tokens 专属体验额度（有效期 180 天） | [百炼 API-KEY 页面](https://bailian.console.aliyun.com/?apiKey=1) | [百炼 OpenAI 兼容文档](https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope) | 2026-10-12 |
| **智谱 GLM** | `https://open.bigmodel.cn/api/paas/v4/` | `glm-4-flash` / `glm-4-air` | `glm-4-plus` | 未找到（官方文档未列出标准 OpenAI GET /models 接口） | 是（支持 `{"type": "json_object"}` 结构化输出） | `glm-4-flash` 模型永久免费调用；新用户注册赠送体验礼包 | [智谱用户中心 API Keys](https://bigmodel.cn/usercenter/apikeys) | [智谱开放平台 API 文档](https://bigmodel.cn/dev/api) | 2026-10-12 |
| **Kimi (月之暗面)** | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | `moonshot-v1-128k` / `moonshot-v1-32k` | 是（`GET https://api.moonshot.cn/v1/models`） | 是（需配合 prompt 结构定义；部分思考模型不支持） | 注册赠送 15 元代金券体验额度 | [Moonshot 控制台 API Keys](https://platform.moonshot.cn/console/api-keys) | [Moonshot 官方文档](https://platform.moonshot.cn/docs) | 2026-10-12 |
| **火山方舟 (豆包)** | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-lite-4k` / `doubao-lite-32k`（需通过接入点 Endpoint ID 调用） | `doubao-pro-32k` / `doubao-pro-128k`（通过 Endpoint ID 调用） | 未找到（平台采用预创建 Endpoint 接入点机制调用） | 是（特定模型支持 `{"type": "json_object"}`） | 各模型首次开通赠送 50 万 Tokens 体验额度 | [火山方舟 API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) | [火山方舟官方文档](https://www.volcengine.com/docs/82379/1263482) | 2026-10-12 |
| **硅基流动 (SiliconFlow)** | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct`（平台免费） / `deepseek-ai/DeepSeek-V3` | `deepseek-ai/DeepSeek-R1` / `Qwen/Qwen2.5-72B-Instruct` | 是（`GET https://api.siliconflow.cn/v1/models`） | 是（支持 `{"type": "json_object"}`，亦支持 json_schema） | 实名注册赠送 14 元代金券体验额度；部分开源轻量模型永久免费 | [硅基流动 API 密钥](https://cloud.siliconflow.cn/account/ak) | [硅基流动开发者文档](https://docs.siliconflow.cn/) | 2026-10-12 |
| **腾讯混元** | `https://api.hunyuan.cloud.tencent.com/v1` | `hunyuan-lite`（官方免费开放） / `hunyuan-standard` | `hunyuan-pro` / `hunyuan-turbo` | 未找到（官方文档未定义标准 GET /models 接口） | 未找到（官方兼容文档未声明 response_format 参数，通常需提示词约束） | 首次开通赠送 100 万 Tokens 资源包；`hunyuan-lite` 模型完全免费 | [混元 API Key 控制台](https://console.cloud.tencent.com/hunyuan/api-key) | [腾讯混元官方文档](https://cloud.tencent.com/document/product/1729/105701) | 2026-10-12 |
| **百度千帆** | `https://qianfan.baidubce.com/v2` | `ernie-speed-128k`（官方免费开放） / `ernie-lite-8k`（免费） | `ernie-4.0-turbo-8k` / `ernie-4.0-8k` | 未找到（千帆 v2 兼容模式未列出通用 GET /models 列表接口） | 是（支持 `response_format: "json_object"`） | `ernie-speed` 与 `ernie-lite` 免费开放；新客赠送体验额度 | [千帆控制台在线服务](https://console.bce.baidu.com/qianfan/ais/console/onlineService) | [千帆大模型平台文档](https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html) | 2026-10-12 |

---

### 说明与使用注意事项

1. **JSON Object 模式规范**：
   - 绝大多数厂商（DeepSeek、阿里云百炼、Moonshot、硅基流动等）在开启 `response_format: {"type": "json_object"}` 时，**系统/用户提示词中必须显式包含 "json" 或 "JSON" 关键字**，否则接口会直接返回 400 校验错误。
2. **Endpoint ID 机制**：
   - 火山方舟（豆包）的调用模型参数 `model` 通常不支持直接传模型名称字符串，而是需要填入在控制台创建的接入点 ID（格式如 `ep-20240604xxxxxx-xxxxx`）。
3. **免费模型优选**：
   - 如果开发插件测试阶段希望完全零成本调用，优先推荐：
     - **智谱 GLM** 的 `glm-4-flash`（永久免费）
     - **百度千帆** 的 `ernie-speed-128k`（永久免费）
     - **腾讯混元** 的 `hunyuan-lite`（永久免费）
     - **硅基流动** 的 `Qwen/Qwen2.5-7B-Instruct` 等托管开源轻量模型（永久免费）
