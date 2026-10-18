// Fast unit tests (no server or database needed): npm test
import { describe, it, expect } from "vitest";
import { add, cmp, isValidQty, mulFactor, sub } from "../src/lib/decimal";
import { formatMoney, formatQty, stockStatus, addDays, todayIn } from "../src/lib/format";

describe("exact decimal previews", () => {
  it("does not suffer floating point drift", () => {
    expect(sub("10", "2.5")).toBe("7.5");
    expect(add("20", "5.5")).toBe("25.5");
    expect(sub(add("20", "5.5"), "3.25")).toBe("22.25");
    expect(add("0.1", "0.2")).toBe("0.3");
  });
  it("converts with unit factors, rounding to 6 dp", () => {
    expect(mulFactor("500", "0.001")).toBe("0.5");
    expect(mulFactor("2", "24")).toBe("48");
    expect(mulFactor("1", "0.083333333333")).toBe("0.083333");
  });
  it("compares and validates", () => {
    expect(cmp("8", "7.5")).toBe(1);
    expect(cmp("7.5", "7.500")).toBe(0);
    expect(isValidQty("0")).toBe(false);
    expect(isValidQty("-1")).toBe(false);
    expect(isValidQty("0.25")).toBe(true);
    expect(isValidQty("1.1234567")).toBe(false);
  });
});

describe("formatting", () => {
  it("trims trailing zeros and groups thousands", () => {
    expect(formatQty("12.500000")).toBe("12.5");
    expect(formatQty("1000.000000")).toBe("1,000");
    expect(formatQty("0.000000")).toBe("0");
  });
  it("formats naira", () => {
    expect(formatMoney("150000", "₦")).toBe("₦150,000.00");
    expect(formatMoney("3390.1961", "₦")).toBe("₦3,390.20");
  });
  it("classifies stock status", () => {
    expect(stockStatus("0", "5")).toBe("out");
    expect(stockStatus("5", "5")).toBe("low");
    expect(stockStatus("5.01", "5")).toBe("in_stock");
  });
  it("dates", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(todayIn("Africa/Lagos", new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-19");
  });
});
