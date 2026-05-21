import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, Form, Link, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const GROUP_TYPES = [
  { value: "color", label: "Color swatches" },
  { value: "size", label: "Size selector" },
  { value: "text", label: "Text input" },
  { value: "number", label: "Number input" },
  { value: "upload", label: "File upload" },
  { value: "addon", label: "Add-on toggle" },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = params.productId!;
  const gid = `gid://shopify/Product/${productId}`;

  // Fetch product details
  const response = await admin.graphql(
    `#graphql
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          featuredMedia {
            preview { image { url } }
          }
        }
      }`,
    { variables: { id: gid } },
  );
  const json = await response.json();
  const product = json.data?.product;
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  // Fetch (or auto-create) the customizer config
  let config = await db.customizerConfig.findUnique({
    where: { shop_productId: { shop: session.shop, productId } },
    include: {
      groups: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } } },
      },
    },
  });

  if (!config) {
    config = await db.customizerConfig.create({
      data: {
        shop: session.shop,
        productId,
        enabled: false,
        baseImageUrl: product.featuredMedia?.preview?.image?.url ?? null,
      },
      include: {
        groups: {
          orderBy: { position: "asc" },
          include: { options: { orderBy: { position: "asc" } } },
        },
      },
    });
  }

  return { product, config };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const productId = params.productId!;
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  const config = await db.customizerConfig.upsert({
    where: { shop_productId: { shop: session.shop, productId } },
    create: { shop: session.shop, productId, enabled: false },
    update: {},
  });

  switch (intent) {
    case "toggle-enabled": {
      await db.customizerConfig.update({
        where: { id: config.id },
        data: { enabled: !config.enabled },
      });
      break;
    }
    case "update-config": {
      await db.customizerConfig.update({
        where: { id: config.id },
        data: {
          baseImageUrl:
            (formData.get("baseImageUrl")?.toString() || "").trim() || null,
          maskImageUrl:
            (formData.get("maskImageUrl")?.toString() || "").trim() || null,
        },
      });
      break;
    }
    case "add-group": {
      const existing = await db.customizerGroup.count({
        where: { configId: config.id },
      });
      await db.customizerGroup.create({
        data: {
          configId: config.id,
          name: formData.get("name")?.toString() || "Untitled group",
          type: formData.get("type")?.toString() || "color",
          required: formData.get("required") === "on",
          position: existing,
          zIndex: existing,
        },
      });
      break;
    }
    case "delete-group": {
      await db.customizerGroup.delete({
        where: { id: formData.get("groupId")!.toString() },
      });
      break;
    }
    case "add-option": {
      const groupId = formData.get("groupId")!.toString();
      const existing = await db.customizerOption.count({ where: { groupId } });
      await db.customizerOption.create({
        data: {
          groupId,
          label: formData.get("label")?.toString() || "Option",
          value:
            formData.get("value")?.toString() ||
            (formData.get("label")?.toString() || "option")
              .toLowerCase()
              .replace(/\s+/g, "-"),
          colorHex:
            (formData.get("colorHex")?.toString() || "").trim() || null,
          iconUrl: (formData.get("iconUrl")?.toString() || "").trim() || null,
          layerUrl:
            (formData.get("layerUrl")?.toString() || "").trim() || null,
          price: parseFloat(formData.get("price")?.toString() || "0") || 0,
          position: existing,
        },
      });
      break;
    }
    case "delete-option": {
      await db.customizerOption.delete({
        where: { id: formData.get("optionId")!.toString() },
      });
      break;
    }
  }

  return { ok: true };
};

export default function CustomizerProductEditor() {
  const { product, config } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isSubmitting = nav.state === "submitting";

  return (
    <s-page heading={`Customize: ${product.title}`}>
      <Link to="/app/customizer" slot="back-action">
        <s-button variant="tertiary">← All products</s-button>
      </Link>

      <s-section heading="Status">
        <s-stack direction="inline" gap="base" alignment="center">
          <s-text>
            Customizer is{" "}
            <strong>{config.enabled ? "ENABLED" : "DISABLED"}</strong>{" "}
            for this product.
          </s-text>
          <Form method="post">
            <input type="hidden" name="intent" value="toggle-enabled" />
            <s-button type="submit" {...(isSubmitting ? { loading: true } : {})}>
              {config.enabled ? "Disable" : "Enable"}
            </s-button>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Preview images">
        <Form method="post">
          <input type="hidden" name="intent" value="update-config" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="baseImageUrl"
              label="Base image URL"
              details="The bottom-layer product photo. Defaults to the product's featured image. Upload to Shopify Files for a stable URL."
              value={config.baseImageUrl ?? ""}
            />
            <s-text-field
              name="maskImageUrl"
              label="Mask image URL (optional)"
              details="A semi-transparent overlay (shadows, fabric texture, logos). Applied on top of color layers with multiply blend."
              value={config.maskImageUrl ?? ""}
            />
            <s-button type="submit">Save preview images</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Customization groups">
        <s-paragraph>
          Groups appear in order in the customizer UI. For color/size groups,
          set a "Layer URL" on each option to stack PNG overlays on the
          preview.
        </s-paragraph>

        {config.groups.length === 0 ? (
          <s-paragraph>
            <em>No groups yet. Add one below.</em>
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {config.groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Add a new group">
        <Form method="post">
          <input type="hidden" name="intent" value="add-group" />
          <s-stack direction="block" gap="base">
            <s-text-field
              name="name"
              label="Group name"
              details="Shown to customers (e.g. 'Choose jersey color', 'Add your name')"
              required
            />
            <s-select name="type" label="Group type" required>
  {GROUP_TYPES.map((t) => (
    <s-option key={t.value} value={t.value}>
      {t.label}
    </s-option>
  ))}
</s-select>
            <s-checkbox name="required" label="Required to add to cart" />
            <s-button type="submit" variant="primary">
              Add group
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

function GroupCard({
  group,
}: {
  group: {
    id: string;
    name: string;
    type: string;
    required: boolean;
    options: Array<{
      id: string;
      label: string;
      value: string;
      colorHex: string | null;
      iconUrl: string | null;
      layerUrl: string | null;
      price: number;
    }>;
  };
}) {
  const isOptionType =
    group.type === "color" ||
    group.type === "size" ||
    group.type === "addon";

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base" alignment="center">
          <s-stack direction="block" gap="tight">
            <s-text>
              <strong>{group.name}</strong>
            </s-text>
            <s-text>
              Type: {group.type}
              {group.required ? " · required" : ""}
            </s-text>
          </s-stack>
          <Form method="post">
            <input type="hidden" name="intent" value="delete-group" />
            <input type="hidden" name="groupId" value={group.id} />
            <s-button type="submit" variant="tertiary">
              Delete group
            </s-button>
          </Form>
        </s-stack>

        {isOptionType && (
          <>
            {group.options.length > 0 && (
              <s-stack direction="block" gap="tight">
                {group.options.map((o) => (
                  <s-box
                    key={o.id}
                    padding="tight"
                    borderWidth="base"
                    borderRadius="base"
                  >
                    <s-stack
                      direction="inline"
                      gap="base"
                      alignment="center"
                    >
                      {o.colorHex && (
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            background: o.colorHex,
                            border: "1px solid #ccc",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <s-text>
                        {o.label}
                        {o.price > 0 ? ` (+$${o.price.toFixed(2)})` : ""}
                      </s-text>
                      <Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="delete-option"
                        />
                        <input type="hidden" name="optionId" value={o.id} />
                        <s-button type="submit" variant="tertiary">
                          Remove
                        </s-button>
                      </Form>
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            )}

            <Form method="post">
              <input type="hidden" name="intent" value="add-option" />
              <input type="hidden" name="groupId" value={group.id} />
              <s-stack direction="block" gap="tight">
                <s-text>
                  <strong>Add option to "{group.name}"</strong>
                </s-text>
                <s-text-field
                  name="label"
                  label="Label"
                  details="What customers see (e.g. 'Fire Red')"
                  required
                />
                <s-text-field
                  name="value"
                  label="Value (optional)"
                  details="Internal id, auto-generated from label if blank"
                />
                {group.type === "color" && (
                  <s-text-field
                    name="colorHex"
                    label="Color hex (#rrggbb)"
                    details="For displaying the color swatch (e.g. #ff0000)"
                  />
                )}
                <s-text-field
                  name="layerUrl"
                  label="Layer image URL"
                  details="PNG with transparency that stacks on the preview"
                />
                <s-text-field
                  name="iconUrl"
                  label="Icon URL (optional)"
                  details="Thumbnail for the swatch (overrides color hex)"
                />
                <s-text-field
                  name="price"
                  label="Extra price"
                  details="Added to total. Leave 0 for no upcharge."
                />
                <s-button type="submit">Add option</s-button>
              </s-stack>
            </Form>
          </>
        )}

        {!isOptionType && (
          <s-paragraph>
            This is a {group.type} group — customers enter their own value, so
            no options are needed.
          </s-paragraph>
        )}
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
