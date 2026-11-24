/**
 * Azure geography / region pairs (region id = value stored in settings).
 * Aligned with common Azure Portal region names.
 * @see https://learn.microsoft.com/azure/reliability/regions-list
 */
export type AzureRegionGroup = { geography: string; regions: { id: string; label: string }[] };

export const AZURE_REGION_GROUPS: AzureRegionGroup[] = [
  {
    geography: "Americas",
    regions: [
      { id: "eastus", label: "East US" },
      { id: "eastus2", label: "East US 2" },
      { id: "centralus", label: "Central US" },
      { id: "southcentralus", label: "South Central US" },
      { id: "westus", label: "West US" },
      { id: "westus2", label: "West US 2" },
      { id: "westus3", label: "West US 3" },
      { id: "northcentralus", label: "North Central US" },
      { id: "westcentralus", label: "West Central US" },
      { id: "canadacentral", label: "Canada Central" },
      { id: "canadaeast", label: "Canada East" },
      { id: "brazilsouth", label: "Brazil South" },
      { id: "brazilsoutheast", label: "Brazil Southeast" },
      { id: "mexicocentral", label: "Mexico Central" }
    ]
  },
  {
    geography: "Europe",
    regions: [
      { id: "northeurope", label: "North Europe (Ireland)" },
      { id: "westeurope", label: "West Europe (Netherlands)" },
      { id: "uksouth", label: "UK South" },
      { id: "ukwest", label: "UK West" },
      { id: "francecentral", label: "France Central" },
      { id: "francesouth", label: "France South" },
      { id: "germanywestcentral", label: "Germany West Central" },
      { id: "germanynorth", label: "Germany North" },
      { id: "switzerlandnorth", label: "Switzerland North" },
      { id: "switzerlandwest", label: "Switzerland West" },
      { id: "norwayeast", label: "Norway East" },
      { id: "norwaywest", label: "Norway West" },
      { id: "swedencentral", label: "Sweden Central" },
      { id: "polandcentral", label: "Poland Central" },
      { id: "italynorth", label: "Italy North" },
      { id: "spaincentral", label: "Spain Central" }
    ]
  },
  {
    geography: "Asia Pacific",
    regions: [
      { id: "eastasia", label: "East Asia (Hong Kong)" },
      { id: "southeastasia", label: "Southeast Asia (Singapore)" },
      { id: "australiaeast", label: "Australia East" },
      { id: "australiasoutheast", label: "Australia Southeast" },
      { id: "australiacentral", label: "Australia Central" },
      { id: "centralindia", label: "Central India" },
      { id: "southindia", label: "South India" },
      { id: "westindia", label: "West India" },
      { id: "japaneast", label: "Japan East" },
      { id: "japanwest", label: "Japan West" },
      { id: "koreacentral", label: "Korea Central" },
      { id: "koreasouth", label: "Korea South" },
      { id: "malaysiawest", label: "Malaysia West" },
      { id: "newzealandnorth", label: "New Zealand North" }
    ]
  },
  {
    geography: "Middle East & Africa",
    regions: [
      { id: "uaenorth", label: "UAE North" },
      { id: "uaecentral", label: "UAE Central" },
      { id: "qatarcentral", label: "Qatar Central" },
      { id: "southafricanorth", label: "South Africa North" },
      { id: "southafricawest", label: "South Africa West" },
      { id: "israelcentral", label: "Israel Central" }
    ]
  },
  {
    geography: "US Government & sovereign (where available)",
    regions: [
      { id: "usgovvirginia", label: "US Gov Virginia" },
      { id: "usgovarizona", label: "US Gov Arizona" },
      { id: "usgovtexas", label: "US Gov Texas" }
    ]
  }
];

const _ids = new Set<string>();
for (const g of AZURE_REGION_GROUPS) {
  for (const r of g.regions) {
    _ids.add(r.id);
  }
}

export const AZURE_REGION_IDS: ReadonlySet<string> = _ids;

export function azureRegionLabel(id: string): string | undefined {
  for (const g of AZURE_REGION_GROUPS) {
    const hit = g.regions.find((r) => r.id === id);
    if (hit) return hit.label;
  }
  return undefined;
}
