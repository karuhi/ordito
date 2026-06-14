# docs/ — 設計判断の記録（POC 所見メモ）

Ordito の仕様が「なぜこの形になったか」の根拠。各版の POC で実際にぶつかった穴を、次版の規格に
反映してきた記録。規格本体（[../spec/ordito-spec.md](../spec/ordito-spec.md)）と対で読むと、各規定の動機が分かる。

| メモ | 何を実証し、何を仕様に反映したか |
|------|----------------------------------|
| [findings.md](findings.md) | **第1弾POC**（単一IR→生成→単一HTML）。契約の渡し方4戦略の実測、`params.default` の沈黙脱落 → §4.4 field_map 網羅義務の発端。 |
| [findings-poc2.md](findings-poc2.md) | **第2弾POC**（複数ページ＋コレクション＋混在生成）。TBD (a)〜(d) を実装で決定。枠内リンクの深さ依存 → §4.7。 |
| [findings-skills.md](findings-skills.md) | **スキル化**（差分更新・二段確認）。「確認の主体は AI」設計と §7.3 の整合、スキル粒度・JSON契約の所見。 |
| [skills-two-stage-demo.md](skills-two-stage-demo.md) | 二段確認のエージェント対話トランスクリプト（再現手順付き）。 |

> 注: 第1弾・第2弾の所見メモ（findings.md / findings-poc2.md）は、リポジトリ再編（`spec/` `reference/`
> `conformance/` への分割）より前に書かれたため、本文中のパスは旧構成（`engine/` `schemas/` `dist/` 等）を指す。
> 現行の場所は README のリポジトリ構成を参照。設計判断の内容自体は有効。

旧版の仕様は [../spec/history/](../spec/history/) を参照。
