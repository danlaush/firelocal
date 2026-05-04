import type { Constraint, DocData } from './types';
export type DocEntry = {
    path: string;
    data: DocData;
};
export declare function applyConstraints(docs: DocEntry[], constraints: Constraint[]): DocEntry[];
//# sourceMappingURL=query.d.ts.map