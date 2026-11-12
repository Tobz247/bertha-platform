"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { back, str } from "@/lib/flash";
import { isAdminEmail } from "@/lib/auth";
import { phoneLogin } from "@/lib/rules";
import { createSession, destroySession } from "@/lib/session";

export async function login(fd: FormData) {
  const typed = str(fd, "email").toLowerCase();
  // Suppliers added by an admin without an email sign in with their phone number.
  const email = typed.includes("@") ? typed : phoneLogin(typed);
  const password = str(fd, "password");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit(null, "auth.login_failed", `Failed sign-in for ${email}`, { businessId: user?.businessId ?? null, targetType: "User", targetId: user?.id });
    back("/login", "error", "That login and password don't match. Check them and try again.");
  }
  if (!user.active) {
    await audit(user, "auth.login_blocked", `${user.name} (${email}) tried to sign in but their login is turned off`, { targetType: "User", targetId: user.id });
    back("/login", "error", "Your login has been turned off. Ask your manager to turn it back on.");
  }
  const promote = isAdminEmail(email) && !user.isPlatformAdmin;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(promote ? { isPlatformAdmin: true } : {}) } });
  await audit(user, "auth.login", `${user.name} (${email}) signed in`, { targetType: "User", targetId: user.id });
  if (promote) await audit(user, "admin.granted", `${user.name} (${email}) became a platform admin (listed in ADMIN_EMAILS)`, { targetType: "User", targetId: user.id });
  await createSession(user.id);
  redirect("/");
}

export async function signup(fd: FormData) {
  const type = str(fd, "type") === "SUPPLIER" ? "SUPPLIER" : "BUYER";
  const businessName = str(fd, "businessName");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const phone = str(fd, "phone");
  const area = str(fd, "area");
  const address = str(fd, "address");
  const password = str(fd, "password");
  const categoryIds = fd.getAll("categories").filter((v): v is string => typeof v === "string");

  if (!businessName || !name || !email || !phone || !address || !area) {
    back("/signup", "error", "Fill in every field so suppliers and buyers can reach you.");
  }
  if (password.length < 8) back("/signup", "error", "Use a password of at least 8 characters.");
  if (await db.user.findUnique({ where: { email } })) {
    back("/signup", "error", "An account with that email already exists. Sign in instead.");
  }
  if (type === "SUPPLIER" && categoryIds.length === 0) {
    back("/signup", "error", "Pick at least one category you supply.");
  }

  const user = await db.user.create({
    data: {
      name,
      email,
      phone,
      role: "OWNER",
      isPlatformAdmin: isAdminEmail(email),
      passwordHash: await bcrypt.hash(password, 10),
      business: {
        create: {
          name: businessName,
          type,
          phone,
          address,
          area,
          cacNumber: str(fd, "cacNumber") || null,
          approvalLimit: type === "BUYER" ? 500000 : null,
          verification: type === "BUYER" ? "VERIFIED" : "PENDING",
          categories: type === "SUPPLIER" ? { connect: categoryIds.map((id) => ({ id })) } : undefined,
        },
      },
    },
  });
  await audit(user, "auth.signup", `${name} (${email}) signed up ${businessName} as a ${type === "SUPPLIER" ? "supplier" : "buyer"}`, { targetType: "Business", targetId: user.businessId ?? undefined });
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
