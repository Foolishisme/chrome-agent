# **浏览器插件形态 AI Agent 与底层操控机制深度研究报告**

## **1\. Executive Summary**

针对浏览器插件形态 AI Agent（Browser Operator）在底层操控机制、观察方式、动作执行与架构边界上的核心路线，综合主流开源框架、官方技术文档及闭源商业产品的逆向工程数据，本报告得出以下核心结论。以下结论明确区分为已证实的技术事实与基于技术逻辑的高概率推断。

已证实的核心结论表明，页面观察范式正在经历从直接拉取全量文档对象模型（DOM）向使用无障碍树（Accessibility Tree / Aria Snapshot）的降维转变。通过提取语义化节点并分配唯一引用（Refs），大语言模型（LLM）消耗的 Token 数量可从数万（DOM或截图）骤降至数百个，极大地提升了推理速度与成本效益 1。在底层执行层面，业界正呈现出明显的“去 Playwright 化”趋势。针对高频、细粒度的 Agent 交互，传统的 Playwright 等自动化框架由于存在 Node.js 中间层远程过程调用（RPC）通信，会产生显著的二次网络跳跃延迟与状态漂移。以 browser-use 为代表的前沿框架已转向直接基于 WebSocket 封装原生 Chrome 开发者工具协议（CDP），以实现跨域 iframe 的穿透、更快的元素提取以及底层的全局崩溃恢复 4。

在安全与架构机制方面，高权限插件呈现出体验与合规的双刃剑特征。如 Manus Browser Operator 能够实现无感突破登录态、绕过人机验证（CAPTCHA），其根本依据在于申请了 debugger、cookies 和 \<all\_urls\> 等顶级权限，作为本地代理通过 WebSocket 将底层控制权桥接至云端编排层。然而，这种机制使其具备了类似远程控制木马（RAT）的安全特征，在企业级部署中面临极高的合规风险与网络拦截阻力 5。此外，Chrome Manifest V3 (MV3) 扩展标准对 Agent 构成了致命的生命周期约束。MV3 强制 Service Worker 在空闲或执行长任务超过三十秒时终止，这与大语言模型动辄数十秒的推理耗时产生严重冲突。常规的定时器保活机制已被官方底层拦截，当前主流且被证实的工程解法是依赖离屏文档（Offscreen Document）机制维持持久化的 WebSocket 连接 6。同时，跨域 iframe 与 Shadow DOM 对纯内容脚本（Content Script）注入构成了不可逾越的屏障，必须依赖 CDP 协议的深度探测进行递归展开 10。

基于上述已证实事实，可以得出几个高概率的技术推断。在多标签页状态同步方面，为应对现代单页应用（SPA）在详情页与列表页往返时的状态重置问题，Agent 框架必然在外部运行时或后台脚本中维护一个全局状态机，通过强制新标签页打开详情并在完成后销毁的方式，以维持父级上下文的连续性 12。针对无限滚动与动态加载的终极解法，推断其底层实现普遍采用了滚动驱动观测的状态机模型，即通过执行底层的系统级滚动动作并结合页面状态就绪（Ready State）检测来捕获增量 DOM 树，并在外部数据库中进行元素特征的哈希去重计算，而非依赖浏览器的全量重绘 14。

## **2\. 技术路线地图**

构建一个能够深度操控浏览器的 AI Agent，其技术栈在逻辑上自下而上可划分为六个严密的层级。不同产品的形态差异，本质上是对这些层级在“插件沙箱内”还是“外部操作系统运行时”的排布差异。

在最底层的插件环境层（Environment Layer），主要由扩展机制的基础组件构成。Service Worker 负责事件监听、网络请求拦截以及扩展生命周期管理，但严格受限于 MV3 的休眠机制。内容脚本（Content Scripts）运行在隔离环境（Isolated World）中，能够访问当前页面的 DOM 结构，但无法直接调用绝大多数 Chrome API，亦无法访问页面原生 JavaScript 空间内的变量与方法 16。离屏文档（Offscreen Document）作为一种隐藏的 HTML 页面，提供了持久化的 DOM 环境与不受限的运行时效，常被用作绕过 Service Worker 生命周期限制以建立持久化云端连接的底层通道 7。

页面观察层（Observation Layer）决定了 Agent 如何将非结构化的网页转化为模型可理解的上下文。这一层汇聚了结构化 DOM 抓取、无障碍树（Accessibility Tree）提取、视觉模型直接解析视口截图，以及通过监听 XHR/Fetch 请求与网络响应来进行底层数据截获的多种路径。这些感知手段通过过滤、降维和语义映射，构建出当前网页的状态快照 17。

动作执行层（Action Execution Layer）负责将大模型的决策意图转化为真实的浏览器交互。该层涵盖了从轻量级的 DOM 事件模拟（在 Content Script 中构造 MouseEvent 并派发），到高权限的 chrome.scripting.executeScript 注入，再到利用 CDP 协议触发的系统级绝对坐标点击。不同执行机制的抗干扰能力差异巨大，直接决定了 Agent 在面对复杂反作弊系统时的存活率 4。

浏览器协议层（Protocol Layer）主要围绕 Chrome DevTools Protocol (CDP) 展开。CDP 提供了超越前端业务逻辑的最底层控制权，包括网络阻断、性能追踪、坐标级鼠标移动、跨域框架遍历等。它是构建高鲁棒性自动化系统的基石，也是连接本地浏览器内核与外部智能引擎的底层通信协议 4。

外部运行时与通信层（Runtime / Bridge Layer）负责突破插件沙箱的算力与状态限制。本地 Companion App、Python 守护进程或基于 Playwright 的运行时，提供了无限时的计算环境。近年来，Model Context Protocol (MCP) 标准在此层迅速崛起，使得外部大模型能够以通用工具接口（Tool Calls）的形式，无缝请求浏览器的访问快照或下发点击指令，实现了感知与执行的标准解耦 3。

最上层的编排与控制层（Orchestration Layer）属于 AI 逻辑范畴，包含复杂任务的语义拆解、面对执行失败的指数退避（Exponential Backoff）重试机制、翻页去重算法以及全局状态机管理。这一层通常部署在云端服务器或强大的本地宿主机上，负责指导底层模块完成跨页面的漫长工作流 20。

## **3\. 逐路线详解**

针对关键研究问题，本章深入剖析各项底层技术的原理、实现依据、优缺点及其在复杂 Web 环境下的适用场景边界。

### **3.1 页面观察（Observation）的主流方法与深度解析**

获取页面状态供 LLM 理解的方法，是 Agent 架构设计的核心权衡点。不同观察路径在信息完整度、结构化程度、Token 成本以及稳定性上表现出截然不同的特性。

结构化 DOM 抓取与解析的原理在于，通过 document.documentElement.outerHTML 获取页面全量代码，或利用脚本遍历 DOM 树，强行剥离 \<script\>、\<style\>、\<svg\> 等非视觉节点，生成精简版 HTML 发送给模型。这种方法的优点是信息完整，能够保留大量对交互有帮助的自定义属性（如 data-test-id）。然而，其结构化程度相对较弱，面对复杂的现代单页应用（SPA），即使经过深度清洗，Token 数量依然动辄突破数万大关。DOM 抓取的抗干扰能力极差，现代前端框架（如 Tailwind CSS）生成的哈希动态类名、虚拟列表的动态渲染，以及层级极深的嵌套，极易导致大模型产生幻觉 22。此外，对于跨域 iframe 以及 Shadow DOM 内部封装的内容，传统的选择器查询无法直接穿透，造成信息盲区 11。

无障碍树（Accessibility Tree / Aria Snapshot）正在成为业界的主流方案。该方案调用浏览器原生的无障碍应用程序接口（或通过 Playwright MCP 生成 Aria Snapshot），获取专门为辅助技术设计的页面语义摘要。这棵树严格过滤了视觉噪音，仅包含元素的角色（roles）、名称（names）和当前状态（states） 17。Playwright MCP 和 agent-browser 等代表性框架均深度依赖此技术 1。其最大的优势在于极高的结构化程度和极低的 Token 成本，以 YAML 格式输出的 Aria Snapshot 大小通常仅为 5KB 至 20KB，相比于全量 DOM 或视觉截图，可节省高达 95% 的上下文窗口消耗 2。框架通常为每个交互节点注入独立的引用标记（如 @e1），使得 Agent 能够精准下发指令 1。但该方案存在一个显著缺点：高度依赖目标网站对 Web 内容无障碍指南（WCAG）标准的遵循度。若开发者滥用 \<div\> 标签绑定点击事件且未配置正确的 role 属性，该交互元素在无障碍树中将彻底隐形 28。

纯视觉与截图感知路线（Vision / Screenshot）的原理是使用 chrome.tabs.captureVisibleTab 或 CDP 协议截取当前视口的高清图像，并将其直接交由具备强大视觉理解能力的多模态大模型（如 Claude 3.5 Sonnet 或 GPT-4V）进行解析 19。Anthropic 推出的 Computer Use 以及 Skyvern 框架是这一路线的典型代表 19。作为一种非结构化数据的摄取方式，视觉路线的 Token 计算成本极高且伴随显著的推理延迟。其核心优势在于所见即所得，彻底无视 DOM 的混淆、同源策略限制的隔离框架，甚至能够精准识别 HTML5 Canvas 中绘制的复杂图表。然而，它严重依赖屏幕分辨率配置，若视口内元素过于密集，坐标预测容易产生不可逆的偏差。Anthropic 官方技术文档甚至明确建议将虚拟机分辨率锁定在 1024x768，以在识别精度与 API 成本之间取得平衡 32。此外，视觉模型难以判定元素的空间遮挡关系（如 z-index 覆盖），容易触发无效的交互操作。

底层的 CDP 协议读取与网络请求监听则提供了一条“上帝视角”的感知通道。通过建立与 Chrome DevTools Protocol 的 WebSocket 通信，Agent 能够调用 DOM.getDocument 等核心接口，追踪元素的 backend\_node\_id，从而无视任何安全沙箱穿透所有 Shadow DOM 与外部 iframe 4。同时，网络层的侦听能力使 Agent 能够捕获甚至篡改后端 API 的响应数据，实现数据的高效抽离。但 CDP 协议通信机制繁复，需要框架层维护庞大的事件驱动循环。

通过对上述路线的评估，业界已确定未来的主流感知模式为组合式的混合感知（Hybrid Modality）。该范式以无障碍语义树（Aria Snapshot）作为主体感知手段以确保极低的 Token 消耗，并配合轻量级 DOM 引用实现坐标定位；当系统在画布区域、Flash 残留或非标准 Web 组件中遇到 AOM 解析失败的异常时，优雅地回退（Fallback）至多模态视觉截图路线进行补充纠偏，从而在成本、速度与鲁棒性之间达到最优解 17。

### **3.2 动作执行（Action）的底层机制与可靠性分析**

当 Agent 决定执行“点击登录”或“输入长文本”时，动作下发通道的技术实现直接决定了自动化的鲁棒性以及规避安全风控系统的能力。

在内容脚本中进行 DOM 事件模拟（Content Script Injection）是最轻量、部署最简便的路径。开发者只需通过脚本定位元素，直接调用原生方法。然而，这种方式在真实生产环境中被证明极其脆弱。现代前端单页框架（如 React 和 Vue）通过虚拟 DOM 维护状态，原生点击往往无法触发其合成事件系统。更为致命的是，许多站点的反作弊逻辑会严格校验事件对象的 isTrusted 属性；由 JavaScript 构造并触发的事件该属性恒为 false，导致动作被网站防火墙直接阻断 16。

基于 chrome.debugger 与原生 CDP 协议的控制方案则位于动作执行金字塔的顶端。通过向扩展申请 debugger 权限，Agent 能够下发底层的 Input.dispatchMouseEvent 或 Input.dispatchKeyEvent 指令。这种执行机制模拟的是操作系统级别的输入设备中断，其触发的页面事件具备 isTrusted=true 的天然伪装，能够完美击穿绝大多数前端反作弊检测，无视不可见元素的点击拦截或复杂的表单防刷机制 4。但这种极致的控制力伴随着高昂的用户体验代价：在 Chrome 浏览器中，一旦扩展激活了调试器 API，浏览器视窗顶部将永久悬挂一条警示横幅，明确告知用户当前浏览器正被远程调试，这在商业化产品中通常难以被接受 5。同时，Firefox 浏览器出于安全考量，彻底拒绝在扩展沙箱中实现 chrome.debugger API，导致跨浏览器兼容性破裂 34。

Playwright 与 Puppeteer 等外部自动化框架通过暴露独立的运行时接管浏览器实例。此类框架内置了极其成熟的自动等待机制（Auto-wait），在执行点击前会自动执行一系列复杂的校验：元素是否可见、是否被动画阻塞、是否接收到了指针事件等，大幅降低了交互失败率 35。但这种方案对外部操作系统的依赖极重，必须在本地环境中部署完整的 Node.js 或 Python 守护进程，无法单纯以插件形态分发。

综合评估，如果产品严格局限于“纯浏览器插件”形态，通过注入脚本结合 chrome.debugger 并算法计算视口绝对坐标，是保障动作下发成功率的唯一可行方案 4；若产品架构允许引入外部环境，采用 Playwright 封装好的动作接口或直接通过 CDP WebSocket 下发指令，则是兼顾稳定性与开发效率的最佳路径 36。

### **3.3 插件形态 vs 外部 Runtime 架构的边界与优劣对比**

为了实现浏览器 Agent，业界演化出了五种截然不同的系统架构，它们在部署复杂度、可操控范围与隐私风险上展现出深刻的差异。

纯浏览器插件（Pure Extension）仅依赖 Manifest V3 规范打包的静态资源。其核心优势在于极低的部署门槛（用户仅需在扩展商店点击安装），并且能够天然无缝地继承当前用户的浏览会话、登录态与本地 IP 地址。通过配置 \<all\_urls\> 主机权限，即可实现跨域控制。然而，纯插件模式面临着算力与生命周期的双重死局。MV3 标准强制 Service Worker 在执行密集任务超过三十秒或空闲五分钟后无条件终止 6。面对大型语言模型漫长的推理耗时，后台进程随时可能被系统猎杀，导致上下文断层。开发者被迫采用建立持久离屏文档等“后门”技术进行保活，稳定性难以保障 8。

插件与云端桥接（Plugin \+ Cloud Bridge）架构（例如 Manus Browser Operator）巧妙地绕过了本地算力瓶颈。插件端被削弱为单纯的“眼睛”和“手”，它在后台建立一条加密的 WebSocket 连接，将实时的 DOM 树切片或屏幕数据持续泵送至远程服务器集群，由云端强大的集群完成 LLM 推理、任务规划与状态管理，随后接收云端下发的底层操作指令 5。此架构实现了极致的用户体验，用户无需任何配置即可享受顶级的 Agent 能力，同时享有本地浏览器的免登录特权 37。然而，这种架构在本质上构成了合法的全功能浏览器远程控制木马（RAT）。将用户本地带有鉴权信息的高敏 DOM 数据传输至云端，在企业级网络环境中会立刻触发数据防泄漏（DLP）系统的警报，存在极大的合规死角 5。

插件结合本地陪伴应用（Plugin \+ Local Companion App）则将大脑部署在用户本地机器上。插件通过 Native Messaging Host 机制与本地守护进程（如用 Python 或 Go 编写的应用）进行双向通信。这种模式保证了数据不出域，满足了隐私保护要求，但要求用户下载并配置繁琐的本地可执行文件，大幅提升了使用门槛，产品化推广困难重重 38。

插件结合 MCP 桥接（Plugin \+ MCP Bridge）是当下技术规范化的前沿方向。将浏览器本身抽象为受控的资源节点，通过标准化模型上下文协议（Model Context Protocol），使诸如 Cursor 或 Claude Desktop 等外部宿主应用能够以通用工具调用（Tool Calls）的形式，请求浏览器的状态快照并下发指令 18。该架构逻辑分离清晰，大模型的编排与重试逻辑由外部强大的客户端管理，稳定性极高，是面向开发者和极客群体的理想范式。

纯外部浏览器自动化（无插件模式）则彻底摒弃了扩展机制，直接利用 Playwright 等库通过调试端口启动或附加到一个无头（Headless）或有头浏览器进程上 4。它拥有毫无限制的系统级执行能力，不受任何 MV3 限制的掣肘。缺点在于脱离了用户日常使用的浏览器环境，每次启动可能面临一个纯净的沙箱，登录态复用较为繁琐，且普通用户完全无法驾驭其部署流程。

### **3.4 登录态与本地环境复用的工程实现**

“复用现有的已登录会话”是 AI Agent 从演示玩具走向真实生产力工具的跨越性标志。传统的云端自动化容器面临的最大障碍，在于各类反欺诈系统（如 Cloudflare Turnstile、AWS WAF）对异常 IP、干净的 Cookie 以及空 TLS 指纹的无情封杀 37。

对于基于插件形态的架构，官方文献与逆向分析已经证实，其绕过 CAPTCHA 的核心依据在于“原生宿主寄生”。一旦插件被赋予读取 cookies 和注入 \<all\_urls\> 的权限，Agent 实际上在用户的主浏览器进程空间内运行。它发起的任何页面跳转、网络请求或点击动作，都由底层网络栈自动附加当前域名下的所有 Cookie 和本地存储会话。目标服务器后端的风控探针检测到的，不仅是来自用户真实本地网络（Trusted Environment）的合法 IP 地址，其 User-Agent、JA3 指纹甚至鼠标移动的硬件抖动特征，均与正常用户的日常浏览行为毫无二致 37。系统自然将其放行，从而实现了无感的免登录与反风控穿透 37。

而在外部运行时架构中，Vercel 推出的 agent-browser 框架展示了另一种可行的工程范式。官方文档明确说明，通过传入 \--profile \<path\> 参数，可以直接复用 Chrome 的本地用户数据目录（User Data Directory），从而将缓存、IndexedDB 和登录票据持久化引入自动化流程 40。更有针对性的高级实现是，引导用户以开启远程调试端口（--remote-debugging-port）的模式启动日常使用的 Chrome 浏览器，随后自动化脚本通过 \--auto-connect 标志侦听该端口，直接附着于正在运行的活动标签页（Active Tabs）上，接管已登录的会话 40。这种机制虽然需要命令行干预，但在不依赖插件的情况下完美解决了云端验证码的拦截问题。

### **3.5 翻页、无限滚动与动态加载的自动化策略**

在真实的互联网生态中，数据极少以静态的单页 HTML 形式全量呈现。当 Agent 遇到分页器（Pagination）、无限下拉滚动（Infinite Scroll）或虚拟列表（Virtualized Lists）时，如何确保数据抓取的完整性与一致性，是衡量系统可靠性的关键指标。

根据 GitHub 开源社区及高级自动化框架的公开探讨，虚拟列表带来的最大挑战在于：为了优化内存，现代框架在渲染时会销毁滑出视口的 DOM 节点。因此，Agent 无法在单次静态解析中获取全部内容。业界证实的解法是引入一个持续运行的“页面状态机”（State Machine）。Agent 通过键盘动作（如派发 Keyboard.press("End")）或直接调用 DOM 的 scrollIntoView 强制页面滚动，随后必须调用类似于 wait\_for\_page\_ready\_state() 的网络空闲检测函数，挂起执行流程直至后端 API 请求完成且前端重绘完毕 15。

在此过程中，去重策略（De-duplication）不可或缺。随着每次滚动，Agent 从新生成的无障碍树中提取数据块，并计算条目的特征哈希值，将其追加到外部持久化的内存数据库中。系统需要明确的停止条件（Stop Conditions），Skyvern 等框架公开了其智能回退与终止逻辑：如果在连续多次滚动后，增量数据流为空，或页面高度不再增加，或者返回的 HTTP 状态码提示数据到达末尾，状态机将触发退出机制并向上层返回聚合结果 20。

另一个显著的痛点在于详情页往返陷阱。当 Agent 在列表中点击某一项进入深层详情页，再执行后退操作返回列表页时，React 等前端路由机制极大概率会导致列表重新初始化，Agent 辛苦累积的滚动位置和翻页状态瞬间丢失。为规避这一系统级破坏，主流技术策略被设定为：强制命令大模型在遇到需深入探索的链接时，通过构建 window.open(url, '\_blank') 或模拟鼠标中键的操作，在后台新标签页（New Tab）中打开目标页面。Agent 随即将上下文控制权切换至该新标签，完成深层数据的抓取或表单提交后将其彻底关闭，并将控制权交还给未受任何干扰的原始列表标签页 12。这要求底层框架必须具备极其稳健的多标签页并发控制与句柄管理能力。

### **3.6 环境适配与真实网络环境下的严苛限制**

浏览器插件形态的 Agent 虽然在部署上具备优势，但在实际运行环境中面临着严苛的生态分裂与安全管控限制。

各大浏览器对 Manifest V3 的底层实现差异构成了显著的兼容性壁垒。Google Chrome 与 Microsoft Edge 共享强大的 Chromium 底层，对各类高阶扩展 API 提供了全面的支持。然而，Mozilla Firefox 出于保护用户免受恶意追踪的原则，坚决拒绝在其 WebExtensions API 中引入 chrome.debugger，这直接导致基于系统级底层协议绕过前端反作弊的高端动作注入方案在 Firefox 体系内彻底瘫痪 34。Apple Safari 的 V3 支持同样存在大幅阉割，对于扩展外连机制（externally\_connectable）设定了极其严苛的跨域安全白名单 42。

对于 Manifest V3 本身的生命周期限制，如前文所述，Service Worker 的短暂存活窗口对长期运行的规划型 Agent 是致命的。尽管离屏文档（Offscreen Document）通过声明 AUDIO\_PLAYBACK 或其他常驻理由可以强行延长生命，但这已被 Chromium 开发者社区指责为违背 MV3 初衷的“Hack”手段，未来随时可能面临安全策略的收紧 43。

在企业级部署场景下，技术边界让位于行政管控策略。受管控的网络与设备通常会统一部署域策略（GPO）或移动设备管理（MDM）描述文件。这些策略极大概率会彻底锁死扩展程序的未经审核侧载（Sideloading），剥夺扩展请求 \<all\_urls\> 的通用访问权以防内部机密系统数据外泄，并强制禁用 chrome.debugger 的调用权限 5。因此，面向企业内网办公自动化的场景下，纯插件形态的推进将遇到巨大的安全审计阻力。此外，许多企业安全软件会封堵非标准的本地回环端口（Localhost Ports），使得基于 Native Messaging 或本地 WebSocket 监听的 Companion App 架构亦无法正常建立通信机制。这也解释了为何高度集成的 Playwright 无法直接打包进入浏览器沙箱，其对 Node 核心模块及操作系统的进程衍生能力依赖，在纯净的前端环境中是被绝对禁止的。

## **4\. 业界案例表**

本节对业内具有代表性的 Agent 产品与框架进行多维度的数据提取与横向比对，展示当前技术落地的多样性图谱。

| 产品 / 框架 | 架构形态 | 页面观察方式 | 动作执行方式 | 是否本地浏览器 | 复用登录态 | 依赖插件 | 外部 Runtime | 公开技术依据 |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Manus Browser Operator** | 插件 \+ 云端 Bridge 协同 | 混合模式（结构化 DOM \+ 云端视觉截图分析） | 申请 chrome.debugger 调用协议 / CDP 底层派发 | 是（运行于用户的操作系统中） | 是（无缝继承当前所有的 Cookie 与 Session） | 是 | 是（核心决策由远端云沙盒调度） | 5 |
| **browser-use** | 外部 Python 守护进程 / Runtime | 深度封装的原生 CDP 结构化抓取（穿透 Shadow DOM） | 原生 CDP 协议通信（去除中间件损耗） | 可选连接本地暴露端口的实例 | 可通过复用现存 Profile 数据目录实现 | 否 | 是（纯 Python 事件驱动框架） | 4 |
| **Playwright MCP** | 外部 Runtime (基于 MCP 协议桥接) | 极简的 Accessibility Tree / Aria Snapshot | 依赖 Playwright 的高阶动作 API（具备 Auto-wait 特性） | 可连接本地实例 | 可挂载 Persistent Context 进行认证缓存 | 否 | 是（依赖 Node.js 与 MCP 客户端如 Cursor） | 3 |
| **Atlas (OpenAI)** | 独立定制开发的 AI 原生浏览器应用 | AI 运行时独立进程深度语义解析 | 绕过前端通过底层 WebView / Chromium 核心控制 | 独立自洽沙箱环境 | 独立环境内部维护与同步 | 否（内置原生交互层） | 否（一体化编译架构） | 12 |
| **Anthropic Computer Use** | 系统级全局工具层（不限于浏览器） | 纯屏幕截图视觉解析（Vision-only） | 模拟操作系统底层鼠标坐标与键盘输入中断 | 是 | 是（视作人类直接操作当前桌面应用） | 否（但存在由社区实现的 UI.Vision 插件版本） | 是（官方推荐运行于 Docker 隔离环境或独立虚拟机） | 30 |
| **Skyvern** | 独立 SaaS 平台 / API 调用服务 | 基于计算机视觉（Computer Vision）的布局解析 | 云平台执行引擎进行绝对坐标级控制 | 否（主要在云端机房集中执行） | 否（需要在云平台框架内重新进行授权与登录） | 否 | 是（重度依赖后端分布式基础设施） | 22 |

上述矩阵揭示了商业产品倾向于采用高度集成的定制浏览器（Atlas）或体验极佳的云端桥接插件（Manus）以换取非技术用户的无缝体验；而面向开发者或企业级工作流的开源框架（browser-use, Playwright MCP），则坚持采用外部 Runtime 以确保绝对的安全隔离与无限时的计算自由度。

## **5\. 风险与边界**

构建与部署浏览器 Agent 并非坦途，必须正视其在技术、兼容性、权限及产品化方面不可逾越的边界。

### **技术边界的黑盒陷阱**

现代 Web 组件化开发大量采用了 Shadow DOM 技术来封装内部的样式树与交互逻辑。当 Agent 需要操控一个处于跨源（Cross-origin）iframe 内部，并且其内部结构被 Shadow Root 包裹的元素时，便触及了浏览器的安全红线。传统的 XPath 与基于 querySelector 的内容脚本在面对这两层隔离带时将彻底致盲 24。突破这一边界的唯一解法是彻底放弃纯前端方案，转向 CDP 协议层面，强行追踪系统的 frame\_id 并利用 backend\_node\_id 进行递归式的子树展开 10。这一过程极其耗费算力，且在深度嵌套的页面中可能引发递归死循环。

### **兼容性边界的架构撕裂**

扩展标准的迭代不仅未对 AI 自动化友好，反而构成了生存威胁。MV3 的核心变革在于扼杀一切不可控的长期驻留进程。一旦 Service Worker 因执行超时或闲置被系统强杀，Agent 正在处理的多轮对话状态和复杂任务堆栈将瞬间灰飞烟灭 6。尽管可以通过离屏文档的伪装来苟延残喘，但这无疑是一种脆弱的技术债 8。不同内核厂商的立场分歧，特别是 Firefox 明确拒绝开放调试 API 34，宣判了试图构建“一次编写，处处可用”的跨平台 Agent 插件只能是一个美好的幻想。

### **权限与隐私边界的 RAT 悖论**

赋予插件越强的能力，其安全风险便呈指数级攀升。为保障在任意网页注入动作的顺畅度，插件必须申请几乎所有的顶级权限。安全机构的深度分析指出，这种拥有全局读取、底层调试与静默网络拦截能力的插件，一旦发生云端鉴权失效、凭证泄露或被恶意供应链劫持，便会立刻转化为一个超级“浏览器远控木马”（RAT）5。它能够绕过多因素认证（MFA），在后台静默提取所有包含金融或企业内网机密的会话与 Cookie。在金融、医疗及高科技制造业等受到严格监管的合规领域，此类方案将遭到内网安全体系的无情封杀。

### **产品化边界的脆弱性魔咒**

无论语言模型多么智能，基于大模型的自动化依旧受困于“脆弱选择器悖论”。现存的网络世界并非为机器交互而设计。高频迭代的网站会频繁更换布局结构，甚至部署专门对抗爬虫的随机 DOM 生成器。过度依赖传统的 CSS/XPath 节点路径将导致产品在无尽的自动化测试失败中耗尽维护成本。为了跨越这一边界，必须向无障碍语义树（AOM）融合计算机视觉的双重引擎演进，容忍高额的算力消耗，以空间换取交互的鲁棒性 29。

## **6\. 对“做一个浏览器插件 agent”的启发**

若目标在于打造一款类似 Manus 或 Atlas 级别的高可用商业产品，基于前沿业界实践与技术推演，应当遵循以下路径规划与架构原则。

### **MVP 推荐路线：敏捷与可验证的混合架构**

在产品验证早期，切勿直接构建庞杂的本地守护进程体系，高昂的安装门槛将流失大部分早期受众。应当选择“带有云端决策引擎的混合架构插件”。在感知层，坚决摒弃全量 DOM 的提取，转而在内容脚本中调用 TreeWalker API 深度解析无障碍树节点（ARIA Roles），并生成轻量级的自增 Refs 发送至云端。遇到图表或画布场景，利用 captureVisibleTab 生成切片图像交由多模态模型辅助 17。在执行层，针对普通元素优先尝试脚本注入触发事件；当监测到反欺诈阻断时，通过后台平滑切换至 chrome.debugger 发送底层坐标中断 4。在通信层，必须使用 chrome.offscreen.createDocument 建立安全隔离的离屏文档，通过此隐蔽通道维持与云端编排层的持久长连接，从根本上免疫 MV3 的死亡倒计时 7。

### **不建议踩的工程雷区**

首先，切勿试图将 Playwright、Puppeteer 或其核心依赖强行打包捆绑进 Manifest V3 扩展中。扩展沙箱环境本质上剥夺了操作系统进程生成与 Node.js 核心网络模块的执行权，任何此类尝试均会失败。其次，绝不能轻信基于 setInterval 的心跳保活机制。修改 LocalStorage 以欺骗 Service Worker 生命周期的漏洞已被 Chromium 官方堵死，依赖此类 Hack 手段会导致产品在运行中期无故宕机 6。最后，在提取庞大的元素坐标与状态时，应警惕过度依赖 RPC 中间件抽象。正如业界顶尖开源框架踩坑后所得出的结论，多次的进程跳跃会导致极其严重的延迟与状态漂移，直接封装并使用原生 WebSocket CDP 才是高并发 Agent 的可靠之选 4。

### **后续演进方向：2025-2026 技术破局点**

随着自动化业务链条的延长，单一的插件形态终将无法承载多页面并行协作与长时间无人值守的重任。未来演进的两条终极技术锚点已经清晰： 其一，彻底解耦大脑与执行器官，向操作系统纵深下潜。在用户宿主机部署安全的本地控制端（如基于 MCP 协议的服务端），大语言模型仅通过标准化的指令集索取 Aria Snapshot 并下达交互请求，完全摆脱浏览器安全沙箱的束缚 18。 其二，重构浏览器的系统底层边界（Atlas 模式）。抛弃历史遗留的扩展开发桎梏，构建独立的 AI 原生 GUI 应用程序，将 Chromium 引擎降格为受控的渲染后台 48。这种通过进程隔离的宏大架构，确保了即便网页渲染层遭遇内存泄漏或致命崩溃，AI 的思考上下文流与任务堆栈也安然无恙，这才是迈向通用自治 AI 操作系统的最终坦途。

#### **引用的著作**

1. Agent-Browser: AI-First Browser Automation That Saves 93% of Your Context Window | by Rick Hightower | Spillwave Solutions \- Medium, 访问时间为 四月 17, 2026， [https://medium.com/@richardhightower/agent-browser-ai-first-browser-automation-that-saves-93-of-your-context-window-7a2c52562f8c](https://medium.com/@richardhightower/agent-browser-ai-first-browser-automation-that-saves-93-of-your-context-window-7a2c52562f8c)  
2. Accessibility Snapshots \- Playwriter \- Mintlify, 访问时间为 四月 17, 2026， [https://www.mintlify.com/remorses/playwriter/concepts/accessibility-snapshots](https://www.mintlify.com/remorses/playwriter/concepts/accessibility-snapshots)  
3. Introduction | Playwright, 访问时间为 四月 17, 2026， [https://playwright.dev/mcp/introduction](https://playwright.dev/mcp/introduction)  
4. Closer to the Metal: Leaving Playwright for CDP \- Browser Use, 访问时间为 四月 17, 2026， [https://browser-use.com/posts/playwright-to-cdp](https://browser-use.com/posts/playwright-to-cdp)  
5. Manus Rubra: The Browser Extension With Its Hand in Everything ..., 访问时间为 四月 17, 2026， [https://mindgard.ai/blog/manus-rubra-full-browser-remote-control](https://mindgard.ai/blog/manus-rubra-full-browser-remote-control)  
6. Vibe Engineering: Mv3 Service Worker Keepalive — How Chrome Keeps Killing Our AI Agent | by Dzianis Vashchuk | Medium, 访问时间为 四月 17, 2026， [https://medium.com/@dzianisv/vibe-engineering-mv3-service-worker-keepalive-how-chrome-keeps-killing-our-ai-agent-9fba3bebdc5b](https://medium.com/@dzianisv/vibe-engineering-mv3-service-worker-keepalive-how-chrome-keeps-killing-our-ai-agent-9fba3bebdc5b)  
7. Offscreen Documents in Manifest V3 | Blog \- Chrome for Developers, 访问时间为 四月 17, 2026， [https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3)  
8. How to Create Offscreen Documents in Chrome Extensions: A Complete Guide, 访问时间为 四月 17, 2026， [https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2](https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2)  
9. chrome.offscreen | API \- Chrome for Developers, 访问时间为 四月 17, 2026， [https://developer.chrome.com/docs/extensions/reference/api/offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)  
10. Bug(Edge Case): Handle Self-Referencing iframe in DOM Tree Builder \#2715 \- GitHub, 访问时间为 四月 17, 2026， [https://github.com/browser-use/browser-use/issues/2715](https://github.com/browser-use/browser-use/issues/2715)  
11. How to capture iframe nested within Shadow DOM's "\#shadow-root (open)" element?, 访问时间为 四月 17, 2026， [https://stackoverflow.com/questions/74225479/how-to-capture-iframe-nested-within-shadow-doms-shadow-root-open-element](https://stackoverflow.com/questions/74225479/how-to-capture-iframe-nested-within-shadow-doms-shadow-root-open-element)  
12. ChatGPT Atlas Architecture Explained: Size, Unique Design, and Agent Performance Issues, 访问时间为 四月 17, 2026， [https://jimmysong.io/blog/chatgpt-atlas-architecture-analysis/](https://jimmysong.io/blog/chatgpt-atlas-architecture-analysis/)  
13. Manus vs. OpenAI Operator: The Fight for the Best AI Browser Agent \- Flowith Blog, 访问时间为 四月 17, 2026， [https://flowith.io/blog/manus-vs-openai-operator-best-browser-agent](https://flowith.io/blog/manus-vs-openai-operator-best-browser-agent)  
14. Advanced Infinite Scrolling Example · remix-run remix · Discussion \#4180 \- GitHub, 访问时间为 四月 17, 2026， [https://github.com/remix-run/remix/discussions/4180](https://github.com/remix-run/remix/discussions/4180)  
15. Handling Infinite Scroll \- AgentQL Documentation, 访问时间为 四月 17, 2026， [https://docs.agentql.com/navigating-pagination/infinite-scroll](https://docs.agentql.com/navigating-pagination/infinite-scroll)  
16. Content scripts | Chrome for Developers, 访问时间为 四月 17, 2026， [https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)  
17. Build agent-friendly websites \- web.dev, 访问时间为 四月 17, 2026， [https://web.dev/articles/ai-agent-site-ux](https://web.dev/articles/ai-agent-site-ux)  
18. Playwright MCP, 访问时间为 四月 17, 2026， [https://playwright.dev/docs/getting-started-mcp](https://playwright.dev/docs/getting-started-mcp)  
19. Developing a computer use model \- Anthropic, 访问时间为 四月 17, 2026， [https://www.anthropic.com/news/developing-computer-use](https://www.anthropic.com/news/developing-computer-use)  
20. Error Handling \- Skyvern \- Mintlify, 访问时间为 四月 17, 2026， [https://www.mintlify.com/Skyvern-AI/Skyvern/debugging/error-handling](https://www.mintlify.com/Skyvern-AI/Skyvern/debugging/error-handling)  
21. Error Handling in Browser Automation \- Skyvern, 访问时间为 四月 17, 2026， [https://www.skyvern.com/blog/error-handling-in-browser-automation/](https://www.skyvern.com/blog/error-handling-in-browser-automation/)  
22. Browser Use vs Browserbase: Comparison, Reviews, and Alternatives \- Skyvern, 访问时间为 四月 17, 2026， [https://www.skyvern.com/blog/browser-use-vs-browserbase-comparison-reviews-and-alternatives/](https://www.skyvern.com/blog/browser-use-vs-browserbase-comparison-reviews-and-alternatives/)  
23. Browser Use vs Skyvern | Browser Agents Comparison | Respan \- Keywords AI, 访问时间为 四月 17, 2026， [https://www.respan.ai/market-map/compare/browser-use-vs-skyvern](https://www.respan.ai/market-map/compare/browser-use-vs-skyvern)  
24. Feature Request: Improve the output DOMInteractedElement for special cases (iframes, shadow DOM, shadow DOM in iframes, iframes in shadow DOM, etc.) · Issue \#3820 · browser-use/browser-use \- GitHub, 访问时间为 四月 17, 2026， [https://github.com/browser-use/browser-use/issues/3820](https://github.com/browser-use/browser-use/issues/3820)  
25. Snapshot testing | Playwright Python, 访问时间为 四月 17, 2026， [https://playwright.dev/python/docs/aria-snapshots](https://playwright.dev/python/docs/aria-snapshots)  
26. Browser CLI — a token-efficient browser tool for AI coding agents (95% fewer tokens than Playwright MCP) : r/ClaudeAI \- Reddit, 访问时间为 四月 17, 2026， [https://www.reddit.com/r/ClaudeAI/comments/1scics4/browser\_cli\_a\_tokenefficient\_browser\_tool\_for\_ai/](https://www.reddit.com/r/ClaudeAI/comments/1scics4/browser_cli_a_tokenefficient_browser_tool_for_ai/)  
27. Snapshots | Playwright, 访问时间为 四月 17, 2026， [https://playwright.dev/mcp/snapshots](https://playwright.dev/mcp/snapshots)  
28. How WCAG Standards in MintHCM Enhance Accessibility and AI Content Comprehension, 访问时间为 四月 17, 2026， [https://minthcm.org/how-wcag-standards-in-minthcm-enhance-accessibility-and-ai-content-comprehension/](https://minthcm.org/how-wcag-standards-in-minthcm-enhance-accessibility-and-ai-content-comprehension/)  
29. How AI Agents See Your Website (And How To Build For Them) | The Gradient Group, 访问时间为 四月 17, 2026， [https://gradientgroup.com/how-ai-agents-see-your-website-and-how-to-build-for-them/](https://gradientgroup.com/how-ai-agents-see-your-website-and-how-to-build-for-them/)  
30. Computer use tool \- Claude API Docs, 访问时间为 四月 17, 2026， [https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)  
31. How Skyvern Agents Think and Plan Tasks, 访问时间为 四月 17, 2026， [https://www.skyvern.com/blog/how-skyvern-agents-think-and-plan-tasks/](https://www.skyvern.com/blog/how-skyvern-agents-think-and-plan-tasks/)  
32. Anthropic's Computer Use versus OpenAI's Computer Using Agent (CUA) \- WorkOS, 访问时间为 四月 17, 2026， [https://workos.com/blog/anthropics-computer-use-versus-openais-computer-using-agent-cua](https://workos.com/blog/anthropics-computer-use-versus-openais-computer-using-agent-cua)  
33. Building Browser Agents: Architecture, Security, and Practical Solutions \- arXiv, 访问时间为 四月 17, 2026， [https://arxiv.org/html/2511.19477v1](https://arxiv.org/html/2511.19477v1)  
34. Chrome incompatibilities \- Mozilla \- MDN Web Docs, 访问时间为 四月 17, 2026， [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome\_incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities)  
35. Best Headless Browsers for AI Agents: Top Tools (2026) \- Fast.io, 访问时间为 四月 17, 2026， [https://fast.io/resources/best-headless-browsers-ai-agents/](https://fast.io/resources/best-headless-browsers-ai-agents/)  
36. Playwright: Fast and reliable end-to-end testing for modern web apps, 访问时间为 四月 17, 2026， [https://playwright.dev/](https://playwright.dev/)  
37. Introducing Manus Browser Operator, 访问时间为 四月 17, 2026， [https://manus.im/blog/manus-browser-operator](https://manus.im/blog/manus-browser-operator)  
38. ServiceWorker is shut down every 5 minutes for manifest V3 extension \[40733525\] \- Chromium, 访问时间为 四月 17, 2026， [https://issues.chromium.org/40733525](https://issues.chromium.org/40733525)  
39. Manus AI Browser Operator: The Update That Changes Everything About Automation : r/AISEOInsider \- Reddit, 访问时间为 四月 17, 2026， [https://www.reddit.com/r/AISEOInsider/comments/1p5ulpb/manus\_ai\_browser\_operator\_the\_update\_that\_changes/](https://www.reddit.com/r/AISEOInsider/comments/1p5ulpb/manus_ai_browser_operator_the_update_that_changes/)  
40. vercel-labs/agent-browser: Browser automation CLI for AI ... \- GitHub, 访问时间为 四月 17, 2026， [https://github.com/vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)  
41. Persistent Profiles \- Agent Browser \- Mintlify, 访问时间为 四月 17, 2026， [https://www.mintlify.com/vercel-labs/agent-browser/advanced/profiles](https://www.mintlify.com/vercel-labs/agent-browser/advanced/profiles)  
42. Assessing your Safari web extension's browser compatibility \- Apple Developer, 访问时间为 四月 17, 2026， [https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)  
43. Migrate to a service worker \- Chrome for Developers, 访问时间为 四月 17, 2026， [https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)  
44. Manifest V3 \- Persistent Background page deprecation \- Google Groups, 访问时间为 四月 17, 2026， [https://groups.google.com/a/chromium.org/g/chromium-extensions/c/0Af4aqQcY1Q](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/0Af4aqQcY1Q)  
45. Google's Manifest V3 Still Hurts Privacy, Security, and Innovation, 访问时间为 四月 17, 2026， [https://www.eff.org/deeplinks/2021/12/googles-manifest-v3-still-hurts-privacy-security-innovation](https://www.eff.org/deeplinks/2021/12/googles-manifest-v3-still-hurts-privacy-security-innovation)  
46. OpenAI Atlas Browser: Features, Pros/Cons, Security & Privacy, 访问时间为 四月 17, 2026， [https://seraphicsecurity.com/learn/ai-browser/openai-atlas-browser-features-pros-cons-security-and-privacy/](https://seraphicsecurity.com/learn/ai-browser/openai-atlas-browser-features-pros-cons-security-and-privacy/)  
47. Snapshot testing | Playwright, 访问时间为 四月 17, 2026， [https://playwright.dev/docs/aria-snapshots](https://playwright.dev/docs/aria-snapshots)  
48. How we built OWL, the new architecture behind our ChatGPT-based browser, Atlas | OpenAI, 访问时间为 四月 17, 2026， [https://openai.com/index/building-chatgpt-atlas/](https://openai.com/index/building-chatgpt-atlas/)  
49. Run Anthropic Computer Use in Your Web Browser \- UI Vision, 访问时间为 四月 17, 2026， [https://ui.vision/blog/computer-use-in-browser/](https://ui.vision/blog/computer-use-in-browser/)  
50. Skyvern vs Browser-use : r/AI\_Agents \- Reddit, 访问时间为 四月 17, 2026， [https://www.reddit.com/r/AI\_Agents/comments/1j8jc38/skyvern\_vs\_browseruse/](https://www.reddit.com/r/AI_Agents/comments/1j8jc38/skyvern_vs_browseruse/)  
51. Solving iframe & Shadow DOM Issues with AI: A QA Engineer's Journey | by Toh Lay Mui, 访问时间为 四月 17, 2026， [https://medium.com/@tohlaymui35/solving-iframe-shadow-dom-issues-with-ai-a-qa-engineers-journey-74a6748de79d](https://medium.com/@tohlaymui35/solving-iframe-shadow-dom-issues-with-ai-a-qa-engineers-journey-74a6748de79d)  
52. Offscreen documents within or outside of Service Workers \- Stack Overflow, 访问时间为 四月 17, 2026， [https://stackoverflow.com/questions/75426219/offscreen-documents-within-or-outside-of-service-workers](https://stackoverflow.com/questions/75426219/offscreen-documents-within-or-outside-of-service-workers)  
53. I Tested Playwright's New AI Agents Against AI-Native Testing Platforms. Here's What I Found. | by Valentijn Vanwynsberghe | Mar, 2026 | Medium, 访问时间为 四月 17, 2026， [https://medium.com/@valentijnvanwynsberghe/i-tested-playwrights-new-ai-agents-against-ai-native-testing-platforms-here-s-what-i-found-250e36ba89dd](https://medium.com/@valentijnvanwynsberghe/i-tested-playwrights-new-ai-agents-against-ai-native-testing-platforms-here-s-what-i-found-250e36ba89dd)