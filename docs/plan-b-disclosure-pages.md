# Plan B: Issuer Disclosure Pages

## 發現

Bank of America 和部分發卡行在 CCAD 提交的是「Family Agreement」——一份合約涵蓋多張卡片，沒有特定卡的年費/APR。

**BoA Platinum Signature Agreement 顯示：**
- Annual Fee: $0 to $550 (這是所有卡片的範圍)
- 具體費用在銀行的 Application/Solicitation Disclosure 頁面

## 需要 Plan B 的卡片

### Bank of America (16 張卡)
| 卡片 | 需要 |
|------|------|
| boa-premium-rewards-elite | $550/年 |
| boa-alaska-summit | $395/年 |
| boa-alaska-airlines-visa-biz | $95/年 |
| boa-alaska-airlines-visa-signature | $64/年 |
| boa-premium-rewards | $95/年 |
| Others | 通常 $0 |

### Capital One 零售卡 (需確認)
- capital-one-savor, savor-one, journey-student 等

## Disclosure Page URLs (待驗證)

```javascript
const DISCLOSURE_PAGES = {
  // BoA - 需要找到正確的 URL 格式
  'boa-premium-rewards': 'https://www.bankofamerica.com/credit-cards/cards/premium-rewards-credit-card/',
  'boa-premium-rewards-elite': 'https://www.bankofamerica.com/credit-cards/cards/premium-rewards-elite-credit-card/',
  'boa-customized-cash-rewards': 'https://www.bankofamerica.com/credit-cards/cards/customized-cash-rewards-credit-card/',
  // ...
}
```

## 建議方案

1. **短期：** 手動維護 BoA/Capital One 費率
2. **中期：** 建立 Disclosure Page URL mapping + scraper
3. **長期：** 接受這些卡片的 CCAD 覆蓋率上限

## 已下載的 BoA PDF

- `boa-platinum-signature.pdf` - Visa/Mastercard Platinum/Visa Signature 合約
- 6 頁，包含利率範圍但不含特定卡費用
