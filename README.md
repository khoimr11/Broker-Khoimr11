# Broker-Khoimr11 · dữ liệu cho Xanh Tím Terminal

Chứng khoán. Mỗi ngày giao dịch lúc 15:40 (giờ Việt Nam), GitHub Actions tự chạy `scripts/update.mjs`:

- Lấy danh sách toàn bộ cổ phiếu HOSE, HNX, UPCoM.
- Tải ~400 ngày giá đã điều chỉnh của từng mã (API công khai DNSE) → `data/hist/<MÃ>.json`.
- Chấm điểm kỹ thuật 15 trường phái, dòng tiền, RS, dự báo k-NN → `data/screen_<SÀN>.json`.
- Tâm lý thị trường, thanh khoản, ngành, RRG, nhật ký tín hiệu → `data/market.json`.
- Theo dõi khuyến nghị (giá mua, cắt lỗ, T1/T2/T3) → `data/recs.json`.

Chạy tay: tab **Actions** → *Cập nhật dữ liệu chứng khoán* → **Run workflow**.
