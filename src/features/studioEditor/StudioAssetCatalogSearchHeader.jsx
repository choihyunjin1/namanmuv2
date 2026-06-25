import React from "react";
import { Search } from "lucide-react";

export function StudioAssetCatalogSearchHeader({
  activeCategoryPolicyBadge = "asset",
  assetCount = 0,
  categoryPolicySummary = "asset",
  crumbLabel = "자산",
  onSearchTermChange,
  searchTerm = "",
  showAssetApiOffline = false
}) {
  return (
    <>
      <div className="studio-catalog-context-header studio-catalog-crumb" aria-live="polite">
        <div className="studio-catalog-context-title">
          <strong>{crumbLabel}</strong>
          <span>{assetCount} items</span>
        </div>
        <div className="studio-catalog-policy-row" aria-label={`배치 정책 ${categoryPolicySummary}`}>
          <span className="studio-catalog-policy-count">{assetCount} assets</span>
          <span className="studio-catalog-policy-badge">{activeCategoryPolicyBadge}</span>
          <span className="studio-catalog-policy-summary">{categoryPolicySummary}</span>
        </div>
      </div>
      <label className="studio-catalog-search">
        <Search size={15} />
        <input
          aria-label="자산 검색"
          onChange={(event) => onSearchTermChange?.(event.target.value)}
          placeholder="자산 검색"
          type="search"
          value={searchTerm}
        />
        {showAssetApiOffline ? (
          <span className="studio-catalog-asset-api-status" role="status">
            asset API offline
          </span>
        ) : null}
      </label>
    </>
  );
}
