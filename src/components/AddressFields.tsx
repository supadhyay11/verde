import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AddressParts } from "@/lib/address"

/** Standard street / city / state / ZIP input group, used everywhere an
 * address is captured (provider sign-up, adding/editing a customer
 * property) so addresses are stored in a consistent, structured format
 * instead of one free-text line. */
export function AddressFields({
  value,
  onChange,
  labelClassName = "text-xs",
  required = true,
}: {
  value: AddressParts
  onChange: (value: AddressParts) => void
  labelClassName?: string
  required?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className={labelClassName}>Street Address</Label>
        <Input
          placeholder="124 Maple Dr"
          value={value.street}
          onChange={(e) => onChange({ ...value, street: e.target.value })}
          required={required}
        />
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <div className="space-y-1.5">
          <Label className={labelClassName}>City</Label>
          <Input
            placeholder="Beverly Hills"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            required={required}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={labelClassName}>State</Label>
          <Input
            placeholder="CA"
            maxLength={2}
            value={value.state}
            onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase() })}
            required={required}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={labelClassName}>ZIP</Label>
          <Input
            placeholder="90210"
            inputMode="numeric"
            maxLength={10}
            value={value.zip}
            onChange={(e) => onChange({ ...value, zip: e.target.value })}
            required={required}
          />
        </div>
      </div>
    </div>
  )
}
