-- CreateTable
CREATE TABLE "CustomizerConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "baseImageUrl" TEXT,
    "maskImageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomizerGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "maxLength" INTEGER,
    CONSTRAINT "CustomizerGroup_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CustomizerConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomizerOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "iconUrl" TEXT,
    "layerUrl" TEXT,
    "colorHex" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CustomizerOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomizerGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "selections" TEXT NOT NULL,
    "previewUrl" TEXT,
    "totalPrice" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomizerConfig_shop_productId_key" ON "CustomizerConfig"("shop", "productId");

-- CreateIndex
CREATE INDEX "CustomizerConfig_shop_idx" ON "CustomizerConfig"("shop");

-- CreateIndex
CREATE INDEX "CustomizerGroup_configId_idx" ON "CustomizerGroup"("configId");

-- CreateIndex
CREATE INDEX "CustomizerOption_groupId_idx" ON "CustomizerOption"("groupId");

-- CreateIndex
CREATE INDEX "SavedDesign_shop_productId_idx" ON "SavedDesign"("shop", "productId");
