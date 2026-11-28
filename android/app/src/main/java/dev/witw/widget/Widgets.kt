package dev.witw.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews

abstract class CardWidget(private val feed: Feed) : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        Render.widgets(c, feed)
        RefreshJob.schedule(c)
        if (Store.edition(c, feed) == null) RefreshJob.now(c)
    }
    override fun onEnabled(c: Context) { RefreshJob.schedule(c); RefreshJob.now(c) }
}

class BriefingWidget : CardWidget(Feed.BRIEFING)
class EmergingWidget : CardWidget(Feed.EMERGING)

object Render {
    fun provider(f: Feed) = if (f == Feed.BRIEFING) BriefingWidget::class.java else EmergingWidget::class.java

    /** 카드를 넘기거나 새 판이 오면 위젯·알림을 함께 다시 그린다. */
    fun all(c: Context) { Feed.entries.forEach { widgets(c, it) }; Notifier.show(c) }

    fun widgets(c: Context, f: Feed) {
        val m = AppWidgetManager.getInstance(c)
        val ids = m.getAppWidgetIds(ComponentName(c, provider(f)))
        if (ids.isEmpty()) return
        val v = views(c, f)
        ids.forEach { m.updateAppWidget(it, v) }
    }

    fun action(c: Context, act: String, f: Feed, code: Int): PendingIntent {
        val i = Intent(c, ActionReceiver::class.java).setAction(act).putExtra("feed", f.key)
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun openUrl(c: Context, url: String, code: Int): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun RemoteViews.put(id: Int, s: String) {
        setTextViewText(id, s)
        setViewVisibility(id, if (s.isBlank()) View.GONE else View.VISIBLE)
    }

    fun preview(c: Context, f: Feed) = views(c, f)

    private fun views(c: Context, f: Feed): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_card)
        val base = if (f == Feed.BRIEFING) 100 else 200
        val acc = if (f == Feed.BRIEFING) R.color.acc_briefing else R.color.acc_emerging
        if (Build.VERSION.SDK_INT >= 31) {
            v.setColorStateList(R.id.feed, "setTextColor", acc)
            v.setColorStateList(R.id.num, "setTextColor", acc)
        } else {
            v.setTextColor(R.id.feed, c.getColor(acc)); v.setTextColor(R.id.num, c.getColor(acc))
        }
        v.setOnClickPendingIntent(R.id.refresh, action(c, ActionReceiver.REFRESH, f, base + 3))

        val e = Store.edition(c, f)
        if (e == null || e.cards.isEmpty()) {
            v.setTextViewText(R.id.feed, f.label)
            v.put(R.id.count, "")
            v.put(R.id.cat, "")
            v.put(R.id.title, "불러오는 중")
            v.put(R.id.sub, "인터넷에 연결되면 오늘 판을 받아 옵니다. 오른쪽 위 단추로 다시 받을 수 있습니다.")
            v.put(R.id.text, ""); v.put(R.id.num, ""); v.put(R.id.numlabel, "")
            v.setViewVisibility(R.id.prev, View.INVISIBLE); v.setViewVisibility(R.id.next, View.INVISIBLE)
            v.setOnClickPendingIntent(R.id.body, openUrl(c, f.page, base + 4))
            return v
        }
        val n = e.cards.size
        val i = Store.index(c, f).coerceIn(0, n - 1)
        val card = e.cards[i]
        v.setTextViewText(R.id.feed, e.head)
        v.put(R.id.count, "${i + 1} / $n")
        v.put(R.id.cat, card.cat)
        v.put(R.id.title, card.title)
        v.put(R.id.sub, card.sub)
        v.put(R.id.text, card.text)
        v.put(R.id.num, card.num)
        v.put(R.id.numlabel, card.numLabel)
        v.setViewVisibility(R.id.prev, View.VISIBLE); v.setViewVisibility(R.id.next, View.VISIBLE)
        v.setOnClickPendingIntent(R.id.prev, action(c, ActionReceiver.PREV, f, base + 1))
        v.setOnClickPendingIntent(R.id.next, action(c, ActionReceiver.NEXT, f, base + 2))
        v.setOnClickPendingIntent(R.id.body, openUrl(c, card.link, base + 4))
        v.setOnClickPendingIntent(R.id.numbox, openUrl(c, card.link, base + 5))
        return v
    }
}
