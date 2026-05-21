import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const designs = await db.savedDesign.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { designs };
};

export default function SavedDesigns() {
  const { designs } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Saved customer designs">
      <s-section heading="Recent designs">
        {designs.length === 0 ? (
          <s-paragraph>
            No customer designs saved yet. When a customer customizes a
            product and adds it to cart, a snapshot of their selections shows
            up here.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {designs.map((d) => {
              let selectionsObj: Record<string, unknown> = {};
              try {
                selectionsObj = JSON.parse(d.selections);
              } catch {
                /* ignore */
              }
              return (
                <s-box
                  key={d.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="tight">
                    <s-text>
                      <strong>Design {d.id.slice(0, 8)}</strong> · Product{" "}
                      {d.productId} · ${d.totalPrice.toFixed(2)}
                    </s-text>
                    <s-text>
                      Created: {new Date(d.createdAt).toLocaleString()}
                    </s-text>
                    {d.previewUrl && (
                      <img
                        src={d.previewUrl}
                        alt="Preview"
                        style={{
                          maxWidth: 200,
                          border: "1px solid #ddd",
                          borderRadius: 4,
                        }}
                      />
                    )}
                    <s-box
                      padding="tight"
                      borderWidth="base"
                      borderRadius="base"
                      background="subdued"
                    >
                      <pre style={{ margin: 0, fontSize: 12 }}>
                        <code>{JSON.stringify(selectionsObj, null, 2)}</code>
                      </pre>
                    </s-box>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
