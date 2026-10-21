# Schema 熔炉 · schema-forge

Schema 驱动的表单引擎与可视化设计器。把表单当成源码：**迁移 → 归一化 → 表达式编译 → 依赖建图 → 拓扑排序 → 运行时 store**。

- 运行时内核零框架依赖，Vue 只是适配层
- 自研表达式引擎，不调用 `new Function`
- 依赖图 + Kahn 拓扑排序 + DFS 三色环检测
- 精确脏传播：只重算受影响的下游表达式
- RFC 6902 JSON Patch 撤销 / 重做
- `InferFormData<S>` 从 schema 推导表单数据类型

## 快速开始

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
```

首页是项目说明与真实运行时演示；设计器在 `#/designer`。

Windows 下也可以直接双击根目录的 `start.bat`：自动检查 Node 与 pnpm、安装缺失依赖，启动后打开浏览器。`start.bat --no-open` 只启动服务、不打开浏览器。

```bash
pnpm test       # core 单测，70 条
pnpm typecheck  # vue-tsc 全仓库
pnpm build      # core 产物 + 静态站点（packages/playground/dist）
pnpm preview    # 预览构建产物
```

要求 Node ≥ 20，包管理器固定为 pnpm 9.15.9。

## 仓库结构

```text
packages/
  core/          # 协议、编译、表达式、依赖图、store、校验、Patch（无框架依赖）
  renderer-vue/  # SchemaRenderer / FieldNode / useField，字段级订阅
  materials/     # 内置控件与 propsSchema（属性面板的元数据来源）
  designer/      # 设计器：画布、属性自举、逻辑板、预览、Schema 双向编辑
  playground/    # 演示站：首页、真实运行时、实时基准、设计器入口
```

依赖方向：`core ← renderer-vue ← materials ← designer ← playground`。设计器与渲染器之间只通过 schema 协议和物料注册表通信。

## 编译管线

```text
schema v1.x ──migrate──▶ v2.0 ──normalize──▶ defaults / key 去重
  ──compile expressions──▶ AST + 静态依赖
  ──build graph──▶ Kahn 拓扑排序 + DFS 三色环检测
  ──runtime store──▶ 版本号 / 脏传播 / 校验 / 事件
```

编译结果是一个 `FormProgram`，包含字段索引、效果列表、依赖图、计算顺序、统计信息与 schema 哈希。`createForm()` 接受 schema 或已编译的 program——设计器内部复用后者，避免预览时重复编译。

### 表达式

作用域：`$form` / `$values` / `$self` / `$index` / `$status.<path>.visible|disabled|required`。

```text
$form.trip.type === 'INTERNATIONAL'
len($form.employee.name) >= 2
$status.passport.no.visible
includes($form.employee.name, '重名')
```

白名单函数：`len`、`includes`、`empty`、`sum`、`date`、`upper`、`lower`。**不支持方法调用**（`.includes()` 这类写法会被解析器拒绝），也不存在 `new Function` / `eval`。

### 循环依赖

对值路径和效果节点（`field.visible|disabled|required`）统一建图。拓扑排序后仍有入度的节点参与 DFS 三色环检测，环会以 `compile issue` 的形式返回，而不是在运行时死循环。

## 四条主线

| 线 | 内容 |
| --- | --- |
| A 运行时编译 | 迁移、归一化、表达式 AST、依赖图、拓扑排序、store、同步 / 异步校验 |
| B 设计器编辑 | 画布拖拽、属性面板自举、JSON Patch 历史（300ms 合并、200 步上限）、撤销重做 |
| C 联动配置 | 表达式依赖提取、`$status` 效果链、Kahn + DFS 环检测、下游闭包 |
| D 工程化 | pnpm workspace、70 条单测、strict TS、tsdown + Vite 构建、GitHub Actions |

## 设计器

- **设计**：左侧物料库，中间画布，右侧属性面板。属性面板由物料的 `propsSchema` 驱动，走的是同一个表单引擎。
- **逻辑**：查看表达式效果与依赖，编辑联动规则，编译问题实时反馈。
- **预览**：真实 `createForm` 运行时，联调可见性、禁用、必填与异步校验。
- **Schema**：双向编辑 JSON，导入 / 导出。
- 快捷键：`Ctrl/Cmd + Z` 撤销，`Ctrl/Cmd + Shift + Z` 重做。

设计器默认 schema 覆盖了发票场景，包括 `$status` 三链（切换类型 → 税号可见 → 税号必填）与异步远程校验。本地状态写入 `localStorage`，可用设计器内的重置入口恢复。

## 基准方法

`packages/playground/src/components/BenchmarkPanel.vue` 在浏览器里现场构建 500 字段、120 个表达式的 schema：

- 60 个可见性表达式 + 60 个必填表达式，后者依赖 `$status` 效果节点，形成链式依赖
- 编译耗时取 5 次中位数
- 单次传播取 400 次 × 5 轮的中位数，另有预热
- 对照组为“已预编译 AST、但每次全量扫描 120 条表达式”的朴素实现，对朴素实现更有利

编译实现的优势来自结构：只遍历触发字段的下游闭包，而不是全表扫描。基准只测 core 的传播路径，不包含 Vue 渲染、DOM、网络；数据随机器变化，不应外推为通用性能结论。页面上的数字是真实测量结果，不是写死的营销值。

## 测试

```text
expression.test.ts  17  词法 / 语法 / 白名单 / 方法调用拒绝 / 错误定位
graph.test.ts        9  建图 / 拓扑 / 环检测 / 下游闭包
patch.test.ts       11  apply / diff / invert / 历史合并
protocol.test.ts    14  归一化 / 迁移 / 默认值 / 类型推导
store.test.ts       19  读写 / 可见性 / 校验 / 异步节流 / 序列化 / 事件 / 克隆
```

## 已知边界

- 渲染器目前只有 Vue 版本，`renderer-react` 在路线图里，未实现
- 长表单尚未做虚拟滚动
- 编译是全量的，没有增量编译或编译缓存
- 未发布 npm 包，没有 changesets / size-limit
- 设计器状态存 `localStorage`，没有后端协作与多人编辑
- 首页竞品对比只是基于公开文档的粗粒度定位，不是评测

## 脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动 playground 开发服务器 |
| `pnpm build` | 构建 core，再构建静态站点 |
| `pnpm preview` | 预览构建产物 |
| `pnpm test` | 运行 vitest |
| `pnpm test:watch` | 监听模式 |
| `pnpm typecheck` | `vue-tsc --noEmit` |

CI 定义在 `.github/workflows/ci.yml`：install → typecheck → test → build，并上传 `packages/playground/dist` 作为构件。站点使用相对 `base`，可直接托管在 GitHub Pages 等静态服务上。

## 技术栈

TypeScript 5.7 · Vue 3.5 · Vite 6 · Vitest 2 · tsdown · pnpm workspace。
