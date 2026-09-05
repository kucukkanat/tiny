/**
 * The parts of the host that are a single instance or nothing: two module
 * stores, shared by every feature in the build.
 *
 * They are not on `.` because that entry is what an extension author outside
 * this repo installs for the types, and `@tiny/host` is not on the import map.
 * A second copy of `ask` is a question nothing is waiting on; a second copy of
 * the provider store is an endpoint that stops tracking Settings. Anything
 * arriving at runtime uses `tiny`, which is the one the app built.
 */
export { answerQuestion, askUser, useQuestions, type Question } from './ask'
export {
  hasCredentials,
  isUsable,
  readModels,
  readProvider,
  useProvider,
  writeModels,
} from './provider'
