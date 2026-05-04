export function applyConstraints(docs, constraints) {
    let result = [...docs];
    for (const c of constraints) {
        if (c.type === 'where') {
            result = result.filter((doc) => matchesWhere(doc.data, c.field, c.op, c.value));
        }
    }
    const orderBys = constraints.filter((c) => c.type === 'orderBy');
    if (orderBys.length > 0) {
        result.sort((a, b) => {
            for (const ob of orderBys) {
                const av = getField(a.data, ob.field);
                const bv = getField(b.data, ob.field);
                const cmp = compareValues(av, bv);
                if (cmp !== 0)
                    return ob.dir === 'asc' ? cmp : -cmp;
            }
            return 0;
        });
    }
    const limitC = constraints.find((c) => c.type === 'limit');
    if (limitC) {
        result = result.slice(0, limitC.n);
    }
    return result;
}
function getField(data, field) {
    return field.split('.').reduce((obj, key) => obj?.[key], data);
}
function matchesWhere(data, field, op, target) {
    const value = getField(data, field);
    switch (op) {
        case '==': return value === target;
        case '!=': return value !== target;
        case '<': return value < target;
        case '<=': return value <= target;
        case '>': return value > target;
        case '>=': return value >= target;
        case 'array-contains': return Array.isArray(value) && value.includes(target);
        case 'in': return Array.isArray(target) && target.includes(value);
        case 'not-in': return Array.isArray(target) && !target.includes(value);
    }
}
function compareValues(a, b) {
    if (a === b)
        return 0;
    if (a == null)
        return -1;
    if (b == null)
        return 1;
    return a < b ? -1 : 1;
}
//# sourceMappingURL=query.js.map