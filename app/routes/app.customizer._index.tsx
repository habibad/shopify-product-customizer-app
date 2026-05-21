import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch first 50 products from the shop
  const response = await admin.graphql(
    `#graphql
      query CustomizerProducts {
        products(first: 50, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            handle
            status
            featuredMedia {
              preview {
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }`,
  );
  const json = await response.json();
  const products = json.data?.products?.nodes ?? [];

  // Get which products already have a customizer config
  const productIds = products.map((p: { id: string }) =>
    p.id.replace("gid://shopify/Product/", ""),
  );
  const configs = await db.customizerConfig.findMany({
    where: { shop: session.shop, productId: { in: productIds } },
    select: { productId: true, enabled: true },
  });
  const configMap = new Map(configs.map((c) => [c.productId, c.enabled]));

  return {
    products: products.map(
      (p: {
        id: string;
        title: string;
        handle: string;
        status: string;
        featuredMedia?: { preview?: { image?: { url: string } } };
      }) => {
        const numericId = p.id.replace("gid://shopify/Product/", "");
        return {
          id: numericId,
          gid: p.id,
          title: p.title,
          handle: p.handle,
          status: p.status,
          imageUrl: p.featuredMedia?.preview?.image?.url ?? null,
          hasConfig: configMap.has(numericId),
          configEnabled: configMap.get(numericId) ?? false,
        };
      },
    ),
  };
};

export default function CustomizerIndex() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Product Customizer">
      <s-section heading="Configure products">
        <s-paragraph>
          Pick a product to set up its customization options (color swatches,
          text input, size, file upload, etc). Customers will see a Customize
          button on the product page once the App Embed is enabled in your
          theme.
        </s-paragraph>

        {products.length === 0 ? (
          <s-paragraph>
            No products found. Create a product in Shopify admin first.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((p) => (
              <s-box
                key={p.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base" alignment="center">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      width={60}
                      height={60}
                      style={{
                        objectFit: "cover",
                        borderRadius: "8px",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 60,
                        height: 60,
                        background: "#f0f0f0",
                        borderRadius: 8,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <s-stack direction="block" gap="tight">
                    <s-text>
                      <strong>{p.title}</strong>
                    </s-text>
                    <s-text>
                      {p.hasConfig
                        ? p.configEnabled
                          ? "✓ Configured & enabled"
                          : "⚠ Configured but disabled"
                        : "Not configured yet"}
                    </s-text>
                  </s-stack>
                  <Link to={`/app/customizer/${p.id}`}>
                    <s-button>
                      {p.hasConfig ? "Edit setup" : "Set up customizer"}
                    </s-button>
                  </Link>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          1. Pick a product and add customization groups (e.g. "Choose color
          1", "Add your name").
        </s-paragraph>
        <s-paragraph>
          2. Each group has options. Color/size options can have a layer image
          that stacks on the product preview.
        </s-paragraph>
        <s-paragraph>
          3. Enable the App Embed in your theme editor under Online Store →
          Themes → Customize → App embeds.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Quick links">
        <s-stack direction="block" gap="tight">
          <Link to="/app/customizer-designs">
            <s-link>View saved designs</s-link>
          </Link>
          <Link to="/app">
            <s-link>Back to home</s-link>
          </Link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
