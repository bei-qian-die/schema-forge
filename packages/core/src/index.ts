/**
 * @schema-forge/core — a schema compiler and runtime with no framework,
 * no DOM and no `new Function`.
 */
export {
  SCHEMA_VERSION,
  DEFAULT_LAYOUT,
  LAYOUT_TYPES,
  isLayoutType,
  isValueRule,
  emptyStatus,
  hashSchema,
  type ExpressionSource,
  type RuleKind,
  type RuleSpec,
  type FieldLayout,
  type LayoutContainerType,
  type FieldNode,
  type SchemaLayout,
  type FormSchema,
  type FieldStatus,
  type ErrorTree,
} from './protocol/schema'

export { migrateSchema, type MigrationResult } from './protocol/migrate'

export type { InferFormData, InferFieldValue } from './protocol/infer'

export {
  compileSchema,
  getCompiledField,
  isDataField,
  compileErrors,
  type FormProgram,
  type CompiledField,
  type CompiledEffect,
  type CompiledRule,
  type CompileIssue,
  type CompileStats,
  type StatusProp,
} from './compile'

export {
  compileExpression,
  clearExpressionCache,
  evaluateExpression,
  evaluate,
  evaluateBoolean,
  parseExpression,
  lex,
  parse,
  collectDependencies,
  collectDeps,
  walkAst,
  ExpressionError,
  WHITELIST_FUNCTIONS,
  listWhitelistFunctions,
  isWhitelistedFunction,
  type CompiledExpression,
  type CompileExpressionOptions,
  type ExprNode,
  type EvaluationScope,
  type Dependency,
  type Token,
  type TokenType,
} from './expression'

export {
  createDepGraph,
  addNode,
  addEdge,
  buildDepGraph,
  edgeCount,
  toposort,
  findCycles,
  formatCycle,
  downstreamClosure,
  propagate,
  CircularDependencyError,
  type DepGraph,
  type NodeKind,
  type EffectEdgeSpec,
  type TopoResult,
} from './graph'

export {
  createForm,
  type Form,
  type CreateFormOptions,
  type FormEvent,
  type FormEventType,
  type FormStats,
  type SetValueResult,
  type EffectEvaluation,
  type ValidationResult,
  type ValidateOn,
  type AsyncRuleValidator,
  type AsyncValidationContext,
} from './store/create-store'

export {
  parsePath,
  getPath,
  setPath,
  deletePath,
  deepClone,
  flattenValues,
  isEmpty,
  type PathSegment,
} from './store/path'

export {
  registerMaterial,
  registerMaterials,
  getMaterial,
  listMaterials,
  listMaterialsByGroup,
  clearMaterialRegistry,
  defaultValueForType,
  propsFields,
  type MaterialSpec,
  type ValueType,
} from './registry'

export {
  registerRuleValidator,
  unregisterRuleValidator,
  runSyncRule,
  isAsyncRule,
  defaultRuleMessage,
  listCustomRules,
  type SyncRuleContext,
  type SyncRuleValidator,
} from './validate/rules'

export {
  applyPatch,
  diff,
  createPatch,
  invertPatch,
  escapePointer,
  unescapePointer,
  getAtPointer,
  toPointer,
  pointerSegments,
  PatchError,
  PatchHistory,
  type JsonPatch,
  type JsonPatchOperation,
  type HistoryOptions,
  type HistoryEntry,
} from './patch'
