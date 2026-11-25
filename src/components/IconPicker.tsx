import {
  Banknote, BriefcaseBusiness, CreditCard, Gift, GraduationCap, HeartPulse, House, Landmark,
  PiggyBank, ReceiptText, Shapes, ShoppingBag, ShoppingBasket, Tag, TrainFront, Utensils, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { WALLET_ICONS, type WalletIcon } from '../db/database'
import { CATEGORY_ICONS, type CategoryIcon } from '../domain/categoryIcons'

const walletIcons: Record<WalletIcon, [string, LucideIcon]> = {
  wallet: ['Wallet', Wallet], cash: ['Cash', Banknote], bank: ['Bank', Landmark],
  savings: ['Ipon', PiggyBank], card: ['Card', CreditCard], other: ['Iba pa', Shapes],
}

const categoryIcons: Record<CategoryIcon, [string, LucideIcon]> = {
  tag: ['General', Tag], food: ['Pagkain', Utensils], groceries: ['Grocery', ShoppingBasket],
  transport: ['Biyahe', TrainFront], home: ['Bahay', House], bills: ['Bayarin', ReceiptText],
  health: ['Kalusugan', HeartPulse], shopping: ['Shopping', ShoppingBag],
  work: ['Trabaho', BriefcaseBusiness], gift: ['Regalo', Gift], school: ['School', GraduationCap],
  savings: ['Ipon', PiggyBank],
}

export function WalletSymbol({ icon }: { icon: WalletIcon }) {
  const Symbol = walletIcons[icon][1]
  return <Symbol className="ui-icon" aria-hidden="true" />
}

export function CategorySymbol({ icon }: { icon?: CategoryIcon }) {
  const Symbol = categoryIcons[icon ?? 'tag'][1]
  return <Symbol className="ui-icon" aria-hidden="true" />
}

export function WalletIconPicker({ initial }: { initial: WalletIcon }) {
  const [icon, setIcon] = useState(initial)
  return <label className="field">
    <span>Icon</span>
    <span className="icon-picker">
      <WalletSymbol icon={icon} />
      <select name="walletIcon" value={icon} onChange={(event) => setIcon(event.target.value as WalletIcon)}>
        {WALLET_ICONS.map((option) => <option key={option} value={option}>{walletIcons[option][0]}</option>)}
      </select>
    </span>
  </label>
}

export function CategoryIconPicker({ icon, onChange }: { icon: CategoryIcon; onChange: (icon: CategoryIcon) => void }) {
  return <label className="field">
    <span>Icon ng category</span>
    <span className="icon-picker">
      <CategorySymbol icon={icon} />
      <select value={icon} onChange={(event) => onChange(event.target.value as CategoryIcon)}>
        {CATEGORY_ICONS.map((option) => <option key={option} value={option}>{categoryIcons[option][0]}</option>)}
      </select>
    </span>
  </label>
}
