// EVM Calculator - Earned Value Management with S-curve support

export interface EVMInput {
  plannedValue: number;      // PV - planned value at reporting date
  earnedValue: number;       // EV - earned value at reporting date
  actualCost: number;        // AC - actual cost at reporting date
  budgetAtCompletion: number; // BAC - total budget
}

export interface EVMResult {
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number;
  pc: number;
  status: "on-track" | "ahead" | "behind" | "over-budget" | "under-budget";
  health: "green" | "yellow" | "red";
  interpretation: string;
}

export type EACMethod = "typical" | "current" | "modified" | "optimistic";

export function calculateEAC(input: EVMInput, method: EACMethod = "typical"): number {
  const { earnedValue, actualCost, budgetAtCompletion } = input;
  const cpi = earnedValue / actualCost;
  const spi = earnedValue / input.plannedValue;

  switch (method) {
    case "typical":
      return budgetAtCompletion / cpi;
    case "current":
      return actualCost + (budgetAtCompletion - earnedValue) / (cpi * spi);
    case "modified":
      return actualCost + (budgetAtCompletion - earnedValue) / cpi;
    case "optimistic":
      return actualCost + (budgetAtCompletion - earnedValue);
    default:
      return budgetAtCompletion / cpi;
  }
}

export function calculateEVM(input: EVMInput): EVMResult {
  const { plannedValue, earnedValue, actualCost, budgetAtCompletion } = input;

  const sv = earnedValue - plannedValue;
  const cv = earnedValue - actualCost;
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 0;
  const cpi = actualCost > 0 ? earnedValue / actualCost : 0;

  const eac = calculateEAC(input, "typical");
  const etc = eac - actualCost;
  const vac = budgetAtCompletion - eac;

  const remainingBudget = budgetAtCompletion - earnedValue;
  const remainingCost = budgetAtCompletion - actualCost;
  const tcpi = remainingCost > 0 ? remainingBudget / remainingCost : 0;

  const pc = budgetAtCompletion > 0 ? (earnedValue / budgetAtCompletion) * 100 : 0;

  let status: EVMResult["status"];
  if (spi >= 1 && cpi >= 1) status = "on-track";
  else if (spi > 1.05 && cpi > 1.05) status = "ahead";
  else if (spi < 0.95 || cpi < 0.95) {
    if (cpi < spi) status = "over-budget";
    else status = "behind";
  } else if (cpi >= 1) status = "under-budget";
  else status = "over-budget";

  let health: EVMResult["health"];
  if (spi >= 0.95 && cpi >= 0.95) health = "green";
  else if (spi >= 0.85 && cpi >= 0.85) health = "yellow";
  else health = "red";

  const svStr = sv >= 0 ? `进度超前 ¥${sv.toLocaleString()}` : `进度落后 ¥${Math.abs(sv).toLocaleString()}`;
  const cvStr = cv >= 0 ? `成本节约 ¥${cv.toLocaleString()}` : `成本超支 ¥${Math.abs(cv).toLocaleString()}`;
  const spiStr = spi >= 1 ? `${(spi * 100).toFixed(1)}%` : `${(spi * 100).toFixed(1)}%`;
  const cpiStr = cpi >= 1 ? `${(cpi * 100).toFixed(1)}%` : `${(cpi * 100).toFixed(1)}%`;

  let interp = `当前绩效：SPI=${spiStr}，CPI=${cpiStr}。${svStr}，${cvStr}。`;
  if (eac > budgetAtCompletion) {
    interp += `预计完工成本¥${eac.toLocaleString()}超出预算¥${vac.toLocaleString()}。`;
  } else if (eac < budgetAtCompletion) {
    interp += `预计完工成本¥${eac.toLocaleString()}低于预算¥${Math.abs(vac).toLocaleString()}。`;
  }

  return { sv, cv, spi, cpi, eac, etc, vac, tcpi, pc, status, health, interpretation: interp };
}

// Period-based EVM data structure
export interface EVMDataPoint {
  period: string;
  plannedValue: number;  // PV
  actualCost: number;    // AC
  completionPercent: number; // 0-100
  earnedValue: number;   // EV = PV * completion%
}

export interface EVMProjectResult {
  totalPV: number;
  totalAC: number;
  totalEV: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  vac: number;
  dataPoints: EVMDataPoint[];
  status: EVMResult["status"];
  health: EVMResult["health"];
  interpretation: string;
}

// Calculate EVM from period-based data
export function calculateEVMFromPeriods(
  dataPoints: EVMDataPoint[],
  budgetAtCompletion: number
): EVMProjectResult {
  const totalPV = dataPoints.reduce((sum, d) => sum + d.plannedValue, 0);
  const totalAC = dataPoints.reduce((sum, d) => sum + d.actualCost, 0);
  const totalEV = dataPoints.reduce((sum, d) => sum + (d.plannedValue * d.completionPercent / 100), 0);

  const sv = totalEV - totalPV;
  const cv = totalEV - totalAC;
  const spi = totalPV > 0 ? totalEV / totalPV : 0;
  const cpi = totalAC > 0 ? totalEV / totalAC : 0;
  const eac = cpi > 0 ? budgetAtCompletion / cpi : budgetAtCompletion;
  const etc = eac - totalAC;
  const vac = budgetAtCompletion - eac;

  let status: EVMResult["status"];
  if (spi >= 1 && cpi >= 1) status = "on-track";
  else if (spi > 1.05 && cpi > 1.05) status = "ahead";
  else if (spi < 0.95 || cpi < 0.95) {
    if (cpi < spi) status = "over-budget";
    else status = "behind";
  } else if (cpi >= 1) status = "under-budget";
  else status = "over-budget";

  let health: EVMResult["health"];
  if (spi >= 0.95 && cpi >= 0.95) health = "green";
  else if (spi >= 0.85 && cpi >= 0.85) health = "yellow";
  else health = "red";

  const spiStr = spi >= 1 ? `${(spi * 100).toFixed(1)}%` : `${(spi * 100).toFixed(1)}%`;
  const cpiStr = cpi >= 1 ? `${(cpi * 100).toFixed(1)}%` : `${(cpi * 100).toFixed(1)}%`;
  const svStr = sv >= 0 ? `进度超前 ¥${sv.toFixed(0)}` : `进度落后 ¥${Math.abs(sv).toFixed(0)}`;
  const cvStr = cv >= 0 ? `成本节约 ¥${cv.toFixed(0)}` : `成本超支 ¥${Math.abs(cv).toFixed(0)}`;

  let interp = `当前绩效：SPI=${spiStr}，CPI=${cpiStr}。${svStr}，${cvStr}。`;
  if (eac > budgetAtCompletion) {
    interp += `预计完工成本¥${eac.toFixed(0)}万超出预算¥${vac.toFixed(0)}万。`;
  } else if (eac < budgetAtCompletion) {
    interp += `预计完工成本¥${eac.toFixed(0)}万低于预算¥${Math.abs(vac).toFixed(0)}万。`;
  }

  return {
    totalPV,
    totalAC,
    totalEV,
    sv,
    cv,
    spi,
    cpi,
    eac,
    etc,
    vac,
    dataPoints,
    status,
    health,
    interpretation: interp,
  };
}

// Generate S-curve data for chart visualization
export function generateSCurveFromPeriods(
  dataPoints: EVMDataPoint[]
): Array<{ period: string; pv: number; ev: number; ac: number }> {
  let cumulativePV = 0;
  let cumulativeEV = 0;
  let cumulativeAC = 0;

  return dataPoints.map(d => {
    cumulativePV += d.plannedValue;
    cumulativeEV += d.plannedValue * d.completionPercent / 100;
    cumulativeAC += d.actualCost;
    return {
      period: d.period,
      pv: Math.round(cumulativePV * 10) / 10,
      ev: Math.round(cumulativeEV * 10) / 10,
      ac: Math.round(cumulativeAC * 10) / 10,
    };
  });
}

// Four EAC calculation methods comparison
export function calculateEACMethods(
  input: EVMInput
): Record<EACMethod, number> {
  const { earnedValue, actualCost, budgetAtCompletion } = input;
  const cpi = earnedValue / actualCost;
  const spi = earnedValue / input.plannedValue;

  return {
    typical: budgetAtCompletion / cpi,
    current: actualCost + (budgetAtCompletion - earnedValue) / (cpi * spi),
    modified: actualCost + (budgetAtCompletion - earnedValue) / cpi,
    optimistic: actualCost + (budgetAtCompletion - earnedValue),
  };
}