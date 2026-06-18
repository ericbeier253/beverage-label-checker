export function checkAuth(request: Request): boolean {
  const serverKey = process.env.EVALUATOR_ACCESS_KEY;
  // Fallback for local development if no key is set
  if (!serverKey) return true;

  const requestKey = request.headers.get('x-access-key');
  return requestKey === serverKey;
}
