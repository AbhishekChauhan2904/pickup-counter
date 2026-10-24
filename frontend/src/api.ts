export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the counter server");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "Request failed",
      data?.error?.details,
    );
  return data as T;
}
export const rupees = (p: number) => `₹${(p / 100).toFixed(2)}`; // display only; all maths is integer paise
export type Product = {
  id: number;
  name: string;
  price_paise: number;
  available: number;
  description: string;
  image_url: string | null;
  category: string | null;
  parent: string | null;
  tags: string[];
};
export type Cart = Record<number, number>;
export const MAX_ITEM = 5,
  MAX_TOTAL = 15;
