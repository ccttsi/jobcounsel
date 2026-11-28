package dev.witw.widget

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import dev.witw.widget.Store.notifyFeed
import dev.witw.widget.Store.notifyHidden
import dev.witw.widget.Store.notifyOn

/** 알림창·잠금화면에 조용히 떠 있는 한 장. 소리·진동 없이, 단추로 넘긴다. */
object Notifier {
    private const val CH = "today"
    private const val ID = 7

    fun channel(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CH) != null) return
        val ch = NotificationChannel(CH, "오늘 카드", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "브리핑·이머징 카드를 알림창과 잠금화면에 띄웁니다"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(ch)
    }

    fun allowed(c: Context): Boolean {
        val granted = Build.VERSION.SDK_INT < 33 ||
            c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return granted && c.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
    }

    fun cancel(c: Context) = c.getSystemService(NotificationManager::class.java).cancel(ID)

    fun show(c: Context) {
        if (!c.notifyOn || !allowed(c)) { cancel(c); return }
        val f = c.notifyFeed
        val e = Store.edition(c, f) ?: Store.edition(c, f.other()) ?: return
        // 사용자가 밀어서 지운 판은 다음 판이 올 때까지 다시 띄우지 않는다.
        if (c.notifyHidden == e.feed.key + ":" + e.date) return
        channel(c)
        val n = e.cards.size
        val i = Store.index(c, e.feed).coerceIn(0, n - 1)
        val card = e.cards[i]
        val base = if (e.feed == Feed.BRIEFING) 300 else 400
        val body = listOf(card.sub, card.text, listOf(card.num, card.numLabel).filter { it.isNotBlank() }.joinToString("  "))
            .filter { it.isNotBlank() }.joinToString("\n")
        val b = Notification.Builder(c, CH)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(c.getColor(if (e.feed == Feed.BRIEFING) R.color.acc_briefing else R.color.acc_emerging))
            .setSubText("${e.head} · ${i + 1}/$n")
            .setContentTitle(card.title)
            .setContentText(listOf(card.cat, card.sub).filter { it.isNotBlank() }.joinToString(" · "))
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_RECOMMENDATION)
            .setContentIntent(Render.openUrl(c, card.link, base + 4))
            .setDeleteIntent(Render.action(c, ActionReceiver.HIDE, e.feed, base + 6))
            .addAction(Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_prev), "◀ 이전",
                Render.action(c, ActionReceiver.PREV, e.feed, base + 1)).build())
            .addAction(Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_next), "다음 ▶",
                Render.action(c, ActionReceiver.NEXT, e.feed, base + 2)).build())
            .addAction(Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_refresh), e.feed.other().label + "으로",
                Render.action(c, ActionReceiver.SWAP, e.feed, base + 7)).build())
        c.getSystemService(NotificationManager::class.java).notify(ID, b.build())
    }
}
