import { describe, expect, it } from "vitest";
import { BUYER_ROLES, can, isRole, roleChangeProblem, roleLabel } from "@/lib/roles";

describe("can", () => {
  it("lets owners and managers approve, nobody else", () => {
    expect(can({ role: "OWNER" }, "approve")).toBe(true);
    expect(can({ role: "MANAGER" }, "approve")).toBe(true);
    for (const role of ["STAFF", "PROCUREMENT", "KITCHEN", "STOREKEEPER", "ACCOUNTS"]) expect(can({ role }, "approve")).toBe(false);
  });
  it("gives each job role its own work", () => {
    expect(can({ role: "PROCUREMENT" }, "requests")).toBe(true);
    expect(can({ role: "PROCUREMENT" }, "review_kitchen_request")).toBe(true);
    expect(can({ role: "KITCHEN" }, "kitchen_request")).toBe(true);
    expect(can({ role: "KITCHEN" }, "requests")).toBe(false);
    expect(can({ role: "STOREKEEPER" }, "receive")).toBe(true);
    expect(can({ role: "STOREKEEPER" }, "pay")).toBe(false);
    expect(can({ role: "ACCOUNTS" }, "pay")).toBe(true);
    expect(can({ role: "ACCOUNTS" }, "stock")).toBe(false);
  });
  it("keeps general staff working as before (everything except approvals and team)", () => {
    for (const p of ["requests", "order", "receive", "pay", "stock", "recipes"] as const) expect(can({ role: "STAFF" }, p)).toBe(true);
    expect(can({ role: "STAFF" }, "team")).toBe(false);
  });
  it("refuses unknown roles and no user", () => {
    expect(can({ role: "HACKER" }, "view_stock")).toBe(false);
    expect(can(null, "view_stock")).toBe(false);
  });
});

describe("roles list", () => {
  it("labels every role and recognises them", () => {
    for (const r of BUYER_ROLES) expect(isRole(r.role)).toBe(true);
    expect(roleLabel("STOREKEEPER")).toBe("Store keeper");
    expect(isRole("ADMIN")).toBe(false);
  });
});

describe("roleChangeProblem", () => {
  const owner = { id: "o1", role: "OWNER" };
  const manager = { id: "m1", role: "MANAGER" };
  const staff = { id: "s1", role: "STAFF", active: true };
  it("allows a manager to move staff to a job role", () => {
    expect(roleChangeProblem({ actor: manager, target: staff, next: { role: "KITCHEN", active: true }, activeOwners: 1 })).toBeNull();
  });
  it("stops people without the team permission", () => {
    expect(roleChangeProblem({ actor: { id: "x", role: "STAFF" }, target: staff, next: { role: "KITCHEN", active: true }, activeOwners: 1 })).toMatch(/owner or manager/);
  });
  it("stops changing yourself", () => {
    expect(roleChangeProblem({ actor: owner, target: { ...owner, active: true }, next: { role: "MANAGER", active: true }, activeOwners: 2 })).toMatch(/your own/);
  });
  it("only owners touch the owner role", () => {
    expect(roleChangeProblem({ actor: manager, target: staff, next: { role: "OWNER", active: true }, activeOwners: 1 })).toMatch(/Only an owner/);
    expect(roleChangeProblem({ actor: manager, target: { id: "o2", role: "OWNER", active: true }, next: { role: "OWNER", active: false }, activeOwners: 2 })).toMatch(/Only an owner/);
  });
  it("keeps at least one active owner", () => {
    const other = { id: "o2", role: "OWNER", active: true };
    expect(roleChangeProblem({ actor: owner, target: other, next: { role: "MANAGER", active: true }, activeOwners: 1 })).toMatch(/at least one/);
    expect(roleChangeProblem({ actor: owner, target: other, next: { role: "MANAGER", active: true }, activeOwners: 2 })).toBeNull();
  });
  it("rejects unknown roles", () => {
    expect(roleChangeProblem({ actor: owner, target: staff, next: { role: "GOD", active: true }, activeOwners: 1 })).toMatch(/Pick a role/);
  });
});
