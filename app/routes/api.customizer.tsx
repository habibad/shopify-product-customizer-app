import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { corsJson, corsPreflight, corsError } from "../lib/cors.server";

// GET /api/customizer?shop=xxx.myshopify.com&productId=12345
//   → returns the customizer config + groups + options for a product
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  if (!shop || !productId) {
    return corsError("Missing shop or productId", 400);
  }

  const config = await db.customizerConfig.findUnique({
    where: { shop_productId: { shop, productId } },
    include: {
      groups: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } } },
      },
    },
  });

  if (!config || !config.enabled) {
    return corsJson({ enabled: false });
  }

  return corsJson({
    enabled: true,
    config: {
      id: config.id,
      baseImageUrl: config.baseImageUrl,
      maskImageUrl: config.maskImageUrl,
      groups: config.groups.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        required: g.required,
        zIndex: g.zIndex,
        maxLength: g.maxLength,
        options: g.options.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          iconUrl: o.iconUrl,
          layerUrl: o.layerUrl,
          colorHex: o.colorHex,
          price: o.price,
        })),
      })),
    },
  });
};

// POST /api/customizer  body: { shop, productId, selections, previewUrl?, totalPrice? }
//   → saves a customer's design, returns { designId }
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "POST")
    return corsError("Method not allowed", 405);

  let body: {
    shop?: string;
    productId?: string;
    selections?: unknown;
    previewUrl?: string;
    totalPrice?: number;
  };
  try {
    body = await request.json();
  } catch {
    return corsError("Invalid JSON", 400);
  }

  if (!body.shop || !body.productId || !body.selections) {
    return corsError("Missing shop, productId, or selections", 400);
  }

  const design = await db.savedDesign.create({
    data: {
      shop: body.shop,
      productId: body.productId,
      selections: JSON.stringify(body.selections),
      previewUrl: body.previewUrl ?? null,
      totalPrice:
        typeof body.totalPrice === "number" ? body.totalPrice : 0,
    },
  });

  return corsJson({ designId: design.id });
};
