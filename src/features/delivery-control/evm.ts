export interface GovernedEvmPeriod {
  period: string;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
}

export interface GovernedEvmResult {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  vac: number;
}

const round = (value: number, digits = 4) => Number(value.toFixed(digits));

export function calculateGovernedEvm(input: {
  budgetAtCompletion: number;
  periods: GovernedEvmPeriod[];
}): GovernedEvmResult {
  const bac = Number(input.budgetAtCompletion);
  if (!Number.isFinite(bac) || bac <= 0) throw new Error("EVM必须使用已批准的成本基准，BAC必须大于0。");
  if (!Array.isArray(input.periods) || input.periods.length === 0) throw new Error("EVM缺少任务实绩或成本实绩，不能计算。");

  const totals = input.periods.reduce((sum, period) => {
    const pv = Number(period.plannedValue);
    const ev = Number(period.earnedValue);
    const ac = Number(period.actualCost);
    if (![pv, ev, ac].every(value => Number.isFinite(value) && value >= 0)) {
      throw new Error(`期间${period.period || "未命名"}的PV、EV或AC不合法。`);
    }
    return { pv: sum.pv + pv, ev: sum.ev + ev, ac: sum.ac + ac };
  }, { pv: 0, ev: 0, ac: 0 });

  if (totals.pv <= 0 || totals.ac <= 0) throw new Error("EVM需要大于0的计划价值和实际成本。");
  const spi = totals.ev / totals.pv;
  const cpi = totals.ev / totals.ac;
  if (cpi <= 0) throw new Error("当前挣值不足，无法形成有效完工估算。");
  const eac = bac / cpi;

  return {
    bac: round(bac, 2),
    pv: round(totals.pv, 2),
    ev: round(totals.ev, 2),
    ac: round(totals.ac, 2),
    sv: round(totals.ev - totals.pv, 2),
    cv: round(totals.ev - totals.ac, 2),
    spi: round(spi),
    cpi: round(cpi),
    eac: round(eac, 2),
    etc: round(eac - totals.ac, 2),
    vac: round(bac - eac, 2),
  };
}
