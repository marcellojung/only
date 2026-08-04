import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "모아 · 우리 가족의 자산",
    short_name: "모아",
    description: "성근, 지우, 윤재 가족이 함께 관리하는 비공개 자산 대시보드",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ee",
    theme_color: "#224c3b",
    orientation: "portrait",
  };
}
