/**
 * Teams + Departments RLS regression / e2e tests.
 * Run: bun run scripts/teams-rls-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
if (!URL || !SERVICE || !ANON) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const tag = Math.random().toString(36).slice(2, 8);
const passA = "Zx9qL#mK2vP@nR7wQ4A";
const passB = "Ap4uV#nM8jK@qL2xR6B";
const passC = "Wq3pE#rT7yU@iO2sD9C";
const emailA = `tm-a-${tag}@example.test`;
const emailB = `tm-b-${tag}@example.test`;
const emailC = `tm-c-${tag}@example.test`;

let failures = 0;
const results: Array<{ name: string; ok: boolean }> = [];
function expect(name: string, ok: boolean, msg?: string) {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${msg ? ` — ${msg}` : ""}`);
}

async function mkUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  return data.user!.id;
}
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return c;
}

async function main() {
  const idA = await mkUser(emailA, passA);
  const idB = await mkUser(emailB, passB);
  const idC = await mkUser(emailC, passC);
  const A = await signIn(emailA, passA);
  const B = await signIn(emailB, passB);
  const C = await signIn(emailC, passC);

  const orgA = (await A.rpc("create_organization", { _name: `TmOrgA ${tag}`, _slug: `tm-a-${tag}`, _description: "" })).data as any;
  const orgB = (await C.rpc("create_organization", { _name: `TmOrgB ${tag}`, _slug: `tm-b-${tag}`, _description: "" })).data as any;
  expect("orgA created", !!orgA?.id);
  expect("orgB created", !!orgB?.id);

  try {
    // Invite B into orgA as member
    const inv = await A.from("organization_invitations").insert({
      organization_id: orgA.id, email: emailB, role: "member", invited_by: idA,
    }).select("token").single();
    await B.rpc("accept_invitation", { _token: inv.data!.token });

    // === DEPARTMENTS ===
    // Seeded automatically on org create
    const seeded = await A.from("departments").select("id,name").eq("organization_id", orgA.id);
    expect("Default departments seeded", (seeded.data ?? []).length >= 5);

    // A (owner) creates department
    const dept = await A.from("departments").insert({
      organization_id: orgA.id, name: "Ops", slug: `ops-${tag}`, created_by: idA,
    }).select().single();
    expect("Owner creates department", !!dept.data?.id, dept.error?.message);

    // B (member) cannot create department
    const bDept = await B.from("departments").insert({
      organization_id: orgA.id, name: "Bad", slug: `bad-${tag}`, created_by: idB,
    }).select();
    expect("Member cannot create department", !!bDept.error || (bDept.data ?? []).length === 0);

    // C (outsider) cannot SEE departments of orgA
    const cSees = await C.from("departments").select("id").eq("organization_id", orgA.id);
    expect("Outsider cannot SELECT departments", (cSees.data ?? []).length === 0);

    // C cannot INSERT into orgA
    const cIns = await C.from("departments").insert({
      organization_id: orgA.id, name: "X", slug: `x-${tag}`, created_by: idC,
    }).select();
    expect("Outsider cannot INSERT department", !!cIns.error || (cIns.data ?? []).length === 0);

    // Owner UPDATE / DELETE
    const uDept = await A.from("departments").update({ description: "ops team" }).eq("id", dept.data!.id).select();
    expect("Owner updates department", (uDept.data ?? []).length === 1);
    const dDept = await A.from("departments").delete().eq("id", dept.data!.id).select();
    expect("Owner deletes department", (dDept.data ?? []).length === 1);

    // Unique (org, slug)
    const dup1 = await A.from("departments").insert({ organization_id: orgA.id, name: "One", slug: `dup-${tag}`, created_by: idA }).select().single();
    const dup2 = await A.from("departments").insert({ organization_id: orgA.id, name: "Two", slug: `dup-${tag}`, created_by: idA }).select();
    expect("Department unique (org,slug) enforced", !!dup1.data && !!dup2.error);

    // === TEAMS ===
    // A creates team, owner_id = A
    const team = await A.from("teams").insert({
      organization_id: orgA.id, name: "Alpha", slug: `alpha-${tag}`, owner_id: idA, created_by: idA,
    }).select().single();
    expect("Owner creates team", !!team.data?.id, team.error?.message);

    // Trigger: team owner auto-added as team member with role 'owner'
    const tmOwner = await A.from("team_members").select("role").eq("team_id", team.data!.id).eq("user_id", idA).maybeSingle();
    expect("Team owner auto-added as team_member owner", tmOwner.data?.role === "owner");

    // B (org member) can SEE team
    const bSeesTeam = await B.from("teams").select("id").eq("id", team.data!.id).maybeSingle();
    expect("Org member can SELECT team", bSeesTeam.data?.id === team.data!.id);

    // B (org member, not team manager) cannot INSERT team
    const bTeam = await B.from("teams").insert({
      organization_id: orgA.id, name: "Bad", slug: `bad-t-${tag}`, owner_id: idB, created_by: idB,
    }).select();
    expect("Non-admin member cannot create team", !!bTeam.error || (bTeam.data ?? []).length === 0);

    // C (outsider) cannot SEE team
    const cSeesTeam = await C.from("teams").select("id").eq("id", team.data!.id).maybeSingle();
    expect("Outsider cannot SELECT team", cSeesTeam.data === null);

    // C cannot INSERT team into orgA
    const cTeam = await C.from("teams").insert({
      organization_id: orgA.id, name: "X", slug: `x-t-${tag}`, owner_id: idC, created_by: idC,
    }).select();
    expect("Outsider cannot INSERT team", !!cTeam.error || (cTeam.data ?? []).length === 0);

    // Team owner adds B as team member
    const addB = await A.from("team_members").insert({ team_id: team.data!.id, user_id: idB, role: "member" }).select();
    expect("Team owner adds member", (addB.data ?? []).length === 1, addB.error?.message);

    // B (team member, but not manager) cannot add C — and C isn't org member anyway
    const bAdd = await B.from("team_members").insert({ team_id: team.data!.id, user_id: idC, role: "member" }).select();
    expect("Non-manager cannot add team members", !!bAdd.error || (bAdd.data ?? []).length === 0);

    // B can leave (self DELETE)
    const bLeave = await B.from("team_members").delete().eq("team_id", team.data!.id).eq("user_id", idB).select();
    expect("Member can leave team", (bLeave.data ?? []).length === 1);

    // Team owner UPDATE team
    const uTeam = await A.from("teams").update({ description: "updated" }).eq("id", team.data!.id).select();
    expect("Team owner updates team", (uTeam.data ?? []).length === 1);

    // Transfer ownership to B (still org member) — sync_team_owner_membership trigger
    await A.from("team_members").insert({ team_id: team.data!.id, user_id: idB, role: "member" });
    const transfer = await A.from("teams").update({ owner_id: idB }).eq("id", team.data!.id).select();
    expect("Owner transfers team ownership", (transfer.data ?? []).length === 1);
    const bIsOwnerNow = await A.from("team_members").select("role").eq("team_id", team.data!.id).eq("user_id", idB).maybeSingle();
    expect("New owner becomes team_member owner", bIsOwnerNow.data?.role === "owner");
    const aIsMemberNow = await A.from("team_members").select("role").eq("team_id", team.data!.id).eq("user_id", idA).maybeSingle();
    expect("Old owner becomes plain member", aIsMemberNow.data?.role === "member");

    // Cross-tenant: C cannot see team_members of orgA
    const cSeesTM = await C.from("team_members").select("id").eq("team_id", team.data!.id);
    expect("Outsider cannot SELECT team_members", (cSeesTM.data ?? []).length === 0);

    // Cross-tenant: C cannot INSERT into team_members
    const cInsTM = await C.from("team_members").insert({ team_id: team.data!.id, user_id: idC, role: "member" }).select();
    expect("Outsider cannot INSERT team_member", !!cInsTM.error || (cInsTM.data ?? []).length === 0);

    // Team DELETE by team owner (B now)
    const bDelTeam = await B.from("teams").delete().eq("id", team.data!.id).select();
    expect("Team owner deletes team", (bDelTeam.data ?? []).length === 1);

    // Unique (org, slug) on teams
    const t1 = await A.from("teams").insert({ organization_id: orgA.id, name: "One", slug: `uniq-${tag}`, owner_id: idA, created_by: idA }).select().single();
    const t2 = await A.from("teams").insert({ organization_id: orgA.id, name: "Two", slug: `uniq-${tag}`, owner_id: idA, created_by: idA }).select();
    expect("Team unique (org,slug) enforced", !!t1.data && !!t2.error);
  } finally {
    for (const id of [orgA?.id, orgB?.id].filter(Boolean)) await admin.from("organizations").delete().eq("id", id);
    for (const id of [idA, idB, idC]) await admin.auth.admin.deleteUser(id);
  }

  console.log(`\n${results.length - failures}/${results.length} passed`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
