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
import android.widget.RemoteViewsService

abstract class CardWidget(private val feed: Feed) : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        Render.full(c, feed)
        RefreshJob.schedule(c)
        if (Store.edition(c, feed) == null) RefreshJob.now(c)
    }
    override fun onEnabled(c: Context) { RefreshJob.schedule(c); RefreshJob.now(c) }
    override fun onAppWidgetOptionsChanged(c: Context, m: AppWidgetManager, id: Int, o: android.os.Bundle) {
        m.notifyAppWidgetViewDataChanged(intArrayOf(id), R.id.flipper)   // 크기가 바뀌면 요약 줄 수를 다시 잰다
    }
}

class BriefingWidget : CardWidget(Feed.BRIEFING)
class EmergingWidget : CardWidget(Feed.EMERGING)

/** 넘기는 카드 목록을 런처에 건네는 통로. 바탕은 고정이고 카드만 이 목록에서 꺼내 움직인다. */
/** 위젯 카드를 누르면 잠깐 거쳐 브라우저로 자료실의 «지금 보이는 카드»를 연다(화면 없음). */
class OpenActivity : android.app.Activity() {
    override fun onCreate(s: android.os.Bundle?) {
        super.onCreate(s)
        val f = Feed.of(intent?.getStringExtra("feed"))
        val e = Store.edition(this, f)
        val link = e?.cards?.getOrNull(Store.index(this, f).coerceIn(0, maxOf(0, e.cards.size - 1)))?.link ?: f.page
        val u = Uri.parse(link)
        if (u.scheme == "https" && u.host == "witw.pages.dev")
            try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: Exception) {}
        finish()
    }
}

class CardService : RemoteViewsService() {
    override fun onGetViewFactory(i: Intent): RemoteViewsFactory =
        Factory(applicationContext, Feed.of(i.getStringExtra("feed")), i.getIntExtra("wid", 0))

    private class Factory(val c: Context, val f: Feed, val wid: Int) : RemoteViewsFactory {
        private var cards: List<Card> = emptyList()
        private var lines = 0
        private var widthDp = 0
        override fun onCreate() = onDataSetChanged()
        override fun onDataSetChanged() {
            cards = Store.edition(c, f)?.cards ?: emptyList()
            // 세로 높이(dp)에서 고정 칸(머리·숫자·제목·부제·아래 띠 ≈ 212dp)을 빼고 한 줄 ≈ 21dp로 나눈다
            val o = AppWidgetManager.getInstance(c).getAppWidgetOptions(wid)
            val h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
            lines = if (h <= 0) 0 else ((h - 212) / 21).coerceIn(0, 12)
            widthDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
        }
        override fun onDestroy() {}
        override fun getCount() = cards.size
        override fun getViewAt(i: Int): RemoteViews {
            val card = cards.getOrNull(i) ?: return RemoteViews(c.packageName, R.layout.widget_item)
            // 제목이 두 줄로 넘어가면 요약은 한 줄(≈21dp) 덜 보인다. 15sp 굵은 한글 ≈ 15.5dp/자
            val perLine = if (widthDp > 0) ((widthDp - 40) / 15.5f).toInt().coerceAtLeast(8) else 22
            val titleLines = if (card.title.length > perLine) 2 else 1
            return Render.item(c, f, i, cards.size, card, (lines - (titleLines - 1)).coerceAtLeast(0))
        }
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        override fun getItemId(i: Int) = (f.ordinal * 1000 + i).toLong()
        override fun hasStableIds() = true
    }
}

object Render {
    fun provider(f: Feed) = if (f == Feed.BRIEFING) BriefingWidget::class.java else EmergingWidget::class.java
    private fun ids(c: Context, f: Feed) = AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c, provider(f)))
    private fun index(c: Context, f: Feed): Int {
        val n = Store.edition(c, f)?.cards?.size ?: 0
        return if (n == 0) 0 else Store.index(c, f).coerceIn(0, n - 1)
    }

    /** 새 판이 왔거나 처음 놓였을 때: 위젯을 통째로 다시 그리고 알림도 맞춘다. */
    fun all(c: Context) { Feed.entries.forEach { full(c, it) }; Notifier.show(c) }

    fun full(c: Context, f: Feed) {
        val ids = ids(c, f)
        if (ids.isEmpty()) return
        val m = AppWidgetManager.getInstance(c)
        ids.forEach { m.updateAppWidget(it, root(c, f, it)) }
        m.notifyAppWidgetViewDataChanged(ids, R.id.flipper)
        // 카드 목록이 비동기로 채워지기 전에 자리 지정이 먼저 닿으면 첫 장으로 돌아간다 → 잠시 뒤 한 번 더 맞춘다
        val h = android.os.Handler(android.os.Looper.getMainLooper())
        for (ms in longArrayOf(900, 2500)) h.postDelayed({ seat(c, f) }, ms)
    }

    private fun seat(c: Context, f: Feed) {
        val ids = ids(c, f)
        if (ids.isEmpty()) return
        val v = RemoteViews(c.packageName, R.layout.widget_root)
        v.setDisplayedChild(R.id.flipper, index(c, f))
        AppWidgetManager.getInstance(c).partiallyUpdateAppWidget(ids, v)
    }

    /** 한 장 넘기기: 위젯은 그 자리만 바꿔 넘김 움직임이 보이게 하고, 알림도 같은 장으로 맞춘다. */
    fun move(c: Context, f: Feed) {
        seat(c, f)
        Notifier.show(c)
    }

    fun action(c: Context, act: String, f: Feed, code: Int): PendingIntent {
        val i = Intent(c, ActionReceiver::class.java).setAction(act).putExtra("feed", f.key)
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun openUrl(c: Context, url: String, code: Int): PendingIntent {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun root(c: Context, f: Feed, widgetId: Int): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_root)
        val base = if (f == Feed.BRIEFING) 100 else 200
        v.setInt(R.id.root, "setBackgroundResource", if (f == Feed.BRIEFING) R.drawable.bg_br else R.drawable.bg_em)
        val svc = Intent(c, CardService::class.java).putExtra("feed", f.key).putExtra("wid", widgetId)
        svc.data = Uri.parse("witw://cards/${f.key}/$widgetId")   // 위젯마다 따로 묶인다
        v.setRemoteAdapter(R.id.flipper, svc)
        v.setEmptyView(R.id.flipper, R.id.empty)
        // 카드를 누르면 지금 보이는 카드 주소로 연다
        val open = Intent(c, OpenActivity::class.java).putExtra("feed", f.key).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        v.setOnClickPendingIntent(R.id.tap, PendingIntent.getActivity(c, base + 4, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        v.setOnClickPendingIntent(R.id.empty, action(c, ActionReceiver.REFRESH, f, base + 3))
        val has = (Store.edition(c, f)?.cards?.size ?: 0) > 0
        v.setViewVisibility(R.id.nav, if (has) View.VISIBLE else View.GONE)
        v.setOnClickPendingIntent(R.id.prev, action(c, ActionReceiver.PREV, f, base + 1))
        v.setOnClickPendingIntent(R.id.next, action(c, ActionReceiver.NEXT, f, base + 2))
        v.setDisplayedChild(R.id.flipper, index(c, f))
        return v
    }

    private val NUM = Regex("^(\\D*?)([-+−]?\\d[\\d.,]*)(.*)$")

    /** «23.2만명» → 큰 글자 «23.2» + 작은 글자 «만명». 숫자로 시작하지 않으면 큰 글자를 비운다. */
    fun splitNum(s: String): Pair<String, String> {
        val m = NUM.matchEntire(s.trim()) ?: return "" to s.trim()
        val (pre, num, rest) = m.destructured
        val unit = rest.trim() + if (pre.isNotBlank()) " (${pre.trim()})" else ""
        return num to unit.trim()
    }

    /** 한글 제목이 낱자 사이에서 끊기지 않게(«발표 / 회») 낱말 안에 보이지 않는 이음표(U+2060)를 넣는다 — 줄은 띄어쓰기에서만 바뀐다. */
    fun keepWords(s: String) = s.split(' ').joinToString(" ") { w -> if (w.length > 14) w else w.toList().joinToString("\u2060") }

    private fun RemoteViews.put(id: Int, s: String) {
        setTextViewText(id, s)
        setViewVisibility(id, if (s.isBlank()) View.GONE else View.VISIBLE)
    }

    /** 카드 한 장. 위젯 목록과 앱 미리보기가 함께 쓴다. */
    fun item(c: Context, f: Feed, i: Int, n: Int, card: Card, lines: Int = 0): RemoteViews {
        val v = RemoteViews(c.packageName, R.layout.widget_item)
        v.setTextViewText(R.id.label, if (f == Feed.BRIEFING) "BRIEFING" else "EMERGING")
        val lab = if (f == Feed.BRIEFING) R.color.label_br else R.color.label_em
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(R.id.label, "setTextColor", lab)
        else v.setTextColor(R.id.label, c.getColor(lab))
        v.put(R.id.cat, card.cat)
        v.setTextViewText(R.id.folio, "%02d — %02d".format(i + 1, n))
        val (big, unit) = splitNum(card.num)
        val small = listOf(unit, card.numLabel).filter { it.isNotBlank() }.joinToString(" · ")
        v.put(R.id.num, big)
        v.put(R.id.unit, if (big.isBlank()) "" else small)
        v.setViewVisibility(R.id.numrow, if (big.isBlank()) View.GONE else View.VISIBLE)
        v.put(R.id.title, keepWords(card.title))
        // 숫자가 없는 표지 장은 부제 자리에 요약 첫 줄을 둔다
        v.put(R.id.sub, card.sub.ifBlank { card.text.lineSequence().firstOrNull()?.removePrefix("· ") ?: "" })
        v.setTextViewText(R.id.body, card.text)
        v.setInt(R.id.body, "setMaxLines", maxOf(lines, 1))
        v.setViewVisibility(R.id.body, if (lines > 0 && card.text.isNotBlank()) View.VISIBLE else View.INVISIBLE)
        val p = if (n <= 1) 100 else ((i + 1) * 100) / n
        val (on, off) = if (f == Feed.BRIEFING) R.id.prog_br to R.id.prog_em else R.id.prog_em to R.id.prog_br
        v.setViewVisibility(on, View.VISIBLE); v.setViewVisibility(off, View.GONE)
        v.setProgressBar(on, 100, p, false)
        return v
    }
}
