/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type { CitationMapperPort, CitationReference } from '../domain/citation-mapper.port';
export { CITATION_MAPPER } from '../domain/citation-mapper.port';
