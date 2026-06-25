import React from "react";
import { Clock3 } from "lucide-react";

export function StudioAssetRecentStrip({ onAssetPick, recentAssets = [] }) {
  if (!recentAssets.length) return null;

  return (
    <div className="studio-catalog-recent" aria-label="최근 사용 자산">
      <Clock3 size={14} />
      {recentAssets.map((asset) => (
        <button key={asset.id} onClick={() => onAssetPick?.(asset)} title={asset.label} type="button">
          {asset.label}
        </button>
      ))}
    </div>
  );
}
