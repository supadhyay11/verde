import { useParams } from 'react-router-dom'
import { useApp } from '@/lib/app-context'
import { useInvoice } from '@/lib/data'
import { translate } from '@/lib/i18n'
import InvoiceView from '@/components/InvoiceView'
import { Empty, Loading, Screen } from '@/components/ui'

// The page behind a shared invoice link. Opens without signing in, in the
// customer's language (or the signed-in person's own language).
export default function InvoicePage() {
  const { id } = useParams()
  const { user, lang } = useApp()
  const invoice = useInvoice(id)
  const shown = user && lang ? lang : invoice?.customerLang ?? lang ?? 'en'
  const t = (k: Parameters<typeof translate>[1]) => translate(shown, k)

  if (invoice === undefined) return <Loading label={t('loading')} />
  return (
    <Screen title={t('invoice')} nav={false} back={user ? '/billing' : undefined}>
      {invoice === null ? <Empty title={t('invNotFound')} /> : <InvoiceView invoice={invoice} lang={shown} />}
    </Screen>
  )
}
