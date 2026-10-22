import { requireSession, success, error } from "../_helpers";

export async function GET() {
  const session = await requireSession();
  if (!session) return error("Not authenticated.", 401);
  return success({
    customer: { id: session.customerId, name: session.name, email: session.email },
    emailVerified: session.emailVerified,
  });
}
