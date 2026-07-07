export interface MenuItem {
  id: number
  name: string
  price: number
  category: string | null
  image: string | null
  variations: string | null
  taxable: number
  tax_rate: number
  type: string
}

export interface Variation {
  id: number
  name: string
  price: number
}

export interface CartLine {
  product_id: number
  name: string
  price: number
  qty: number
  station: string
  taxable: number
  tax_rate: number
  image: string | null
  modifiers: string[]
  sent?: boolean // restaurant mode: already fired to the kitchen
}
