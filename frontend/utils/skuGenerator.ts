import { Item, ProductVariant } from '../types';

export const generateAutoSKU = (type: string, name: string, attributes?: Record<string, string | number>): string => {
    // Format: TYPE-NAME-ATTRS
    // e.g. PROD-SHIRT-RED-L
    const typePrefix = type ? type.substring(0, 4).toUpperCase() : 'ITEM';
    const namePart = name ? name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase() : 'UNK';

    let sku = `${typePrefix}-${namePart}`;

    if (attributes) {
        Object.values(attributes).forEach(val => {
            const attrPart = String(val).replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
            sku += `-${attrPart}`;
        });
    }

    // Add random suffix to ensure uniqueness if needed, or rely on user to check
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${sku}-${randomSuffix}`;
};

export const generateAutoBarcode = (): string => {
    // EAN-13 style (12 digits + checksum is complex, so just 12 random digits for now)
    // Or just 12 random digits
    let barcode = '';
    for (let i = 0; i < 12; i++) {
        barcode += Math.floor(Math.random() * 10);
    }
    return barcode;
};

export const generateBulkVariants = (
    basePrice: number,
    baseCost: number,
    bulkAttributes: { name: string, values: string[] }[]
): Partial<ProductVariant>[] => {
    if (bulkAttributes.length === 0) return [];

    // Cartesian product of arrays
    const cartesian = (...a: any[][]) => a.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));

    // Extract values arrays
    const valuesArrays = bulkAttributes.map(attr => attr.values);

    // Generate combinations
    // If only one attribute, cartesian logic needs array of arrays
    const combinations = bulkAttributes.length === 1
        ? valuesArrays[0].map(v => [v])
        : cartesian(...valuesArrays);

    return combinations.map(combo => {
        const attributes: Record<string, string> = {};
        let nameSuffix = '';

        // combo is array of values corresponding to bulkAttributes order
        combo.forEach((val: string, index: number) => {
            const attrName = bulkAttributes[index].name;
            attributes[attrName] = val;
            nameSuffix += ` ${val}`;
        });

        // Generate ID parts
        const variantId = 'var_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        // Generate SKU for variant
        // We don't have item name here easily, so we returns partial and let caller handle naming if possible
        // But we returned full objects.

        return {
            id: variantId,
            name: nameSuffix.trim(), // Will be appended to Item Name
            attributes: attributes,
            price: basePrice,
            cost: baseCost,
            stock: 0,
            pages: 1,
            sku: '' // Placeholder, caller should generate
        };
    });
};
