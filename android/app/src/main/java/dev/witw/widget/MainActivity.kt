package dev.witw.widget

import android.Manifest
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import dev.witw.widget.Store.notifyFeed
import dev.witw.widget.Store.notifyHidden
import dev.witw.widget.Store.notifyOn

/** 설정 한 장: 살아 있는 미리보기(위젯과 같은 넘김) · 홈 화면에 놓기 · 알림창/잠금화면 · 새로 받기 */
class MainActivity : Activity() {
    private lateinit var col: LinearLayout
    private lateinit var status: TextView
    private lateinit var notifySwitch: Switch
    private lateinit var feedBtn: Button
    private val holders = HashMap<Feed, FrameLayout>()
    private val shown = HashMap<Feed, Int>()

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()
    private fun color(id: Int) = getColor(id)

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        Notifier.channel(this)
        RefreshJob.schedule(this)

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20f), dp(28f), dp(20f), dp(32f))
        }
        val scroll = ScrollView(this).apply { fitsSystemWindows = true; setBackgroundColor(color(R.color.app_bg)); addView(col) }
        setContentView(scroll)

        col.addView(text("WITW", 12f, R.color.muted, cond = true).apply { letterSpacing = 0.2f })
        col.addView(text("자료실 위젯", 28f, R.color.ink, bold = true).apply { setPadding(0, dp(2f), 0, 0) })
        col.addView(text("홈 화면·알림창·잠금화면에서 오늘의 카드를 한 장씩 넘겨 봅니다.", 14f, R.color.muted).apply { setPadding(0, dp(6f), 0, dp(8f)) })

        for (f in Feed.entries) {
            col.addView(text(if (f == Feed.BRIEFING) "오늘 브리핑" else "이머징 인더스트리", 13f, R.color.muted, bold = true).apply { setPadding(dp(4f), dp(18f), 0, dp(8f)) })
            col.addView(preview(f), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(184f)))
            col.addView(button("홈 화면에 놓기") { pin(f) }, lp(top = 10f))
        }

        val box = panel()
        notifySwitch = Switch(this).apply {
            text = "알림창·잠금화면에 띄우기"
            textSize = 16f
            setTextColor(color(R.color.ink))
            minHeight = dp(48f)
            isChecked = notifyOn && Notifier.allowed(this@MainActivity)
            setOnCheckedChangeListener { _, on -> setNotify(on) }
        }
        box.addView(notifySwitch)
        feedBtn = button("") { notifyFeed = notifyFeed.other(); notifyHidden = ""; Notifier.show(this); sync() }
        box.addView(feedBtn, lp(top = 6f))
        box.addView(text("잠금화면에 내용까지 보이게 하려면 설정 › 잠금화면 › 알림에서 «내용 표시»를 고르세요.", 13f, R.color.muted).apply { setPadding(0, dp(12f), 0, 0) })
        box.addView(button("알림 설정 열기") {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }, lp(top = 10f))
        col.addView(box, lp(top = 26f))

        col.addView(button("지금 새로 받기") { refresh() }, lp(top = 14f))
        status = text("", 12.5f, R.color.muted).apply { setPadding(dp(4f), dp(10f), 0, 0) }
        col.addView(status)

        if (Store.edition(this, Feed.BRIEFING) == null) refresh()
    }

    /** 위젯과 같은 바탕·카드·단추. 넘길 때 위젯과 같은 움직임(아래에서 떠오름)으로 바뀐다. */
    private fun preview(f: Feed): View {
        val frame = FrameLayout(this).apply {
            setBackgroundResource(if (f == Feed.BRIEFING) R.drawable.bg_br else R.drawable.bg_em)
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(v: View, o: Outline) = o.setRoundRect(0, 0, v.width, v.height, resources.getDimension(R.dimen.widget_radius))
            }
            clipToOutline = true
        }
        val holder = FrameLayout(this)
        frame.addView(holder, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        holders[f] = holder
        val nav = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((icon, d) in listOf(R.drawable.ic_prev to -1, R.drawable.ic_next to 1)) {
            nav.addView(ImageButton(this).apply {
                setImageResource(icon); setBackgroundResource(R.drawable.btn_round)
                contentDescription = if (d < 0) "이전" else "다음"
                setOnClickListener { step(f, d) }
            }, LinearLayout.LayoutParams(dp(44f), dp(44f)).apply { marginStart = dp(2f) })
        }
        frame.addView(nav, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, dp(8f), dp(8f)) })
        return frame
    }

    private fun step(f: Feed, d: Int) {
        val n = Store.edition(this, f)?.cards?.size ?: return
        Store.setIndex(this, f, ((Store.index(this, f) + d) % n + n) % n)
        Render.move(this, f)   // 홈 화면 위젯·알림도 같은 장으로
    }

    private fun drawCard(f: Feed, animate: Boolean) {
        val holder = holders[f] ?: return
        val e = Store.edition(this, f)
        val old = holder.getChildAt(holder.childCount - 1)
        if (e == null || e.cards.isEmpty()) {
            holder.removeAllViews()
            holder.addView(text("오늘 판을 받는 중입니다", 14f, R.color.ink).apply { gravity = Gravity.CENTER },
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            shown.remove(f); return
        }
        val i = Store.index(this, f).coerceIn(0, e.cards.size - 1)
        if (shown[f] == i && old != null && !animate) return
        val card = e.cards[i]
        val v = Render.item(this, f, i, e.cards.size, card).apply(this, holder)
        v.setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(card.link))) }
        holder.addView(v)
        shown[f] = i
        if (animate && old != null) {
            old.animate().translationY(-24f).alpha(0f).setDuration(180).setInterpolator(AccelerateInterpolator())
                .withEndAction { holder.removeView(old) }.start()
            v.alpha = 0f; v.translationY = 36f
            v.animate().translationY(0f).alpha(1f).setStartDelay(90).setDuration(360).setInterpolator(DecelerateInterpolator(1.6f)).start()
        } else if (old != null) holder.removeView(old)
    }

    /* 미리보기 ◀ ▶, 위젯·알림 단추, 새 판 도착 — 저장값이 바뀌면 화면도 따라간다. */
    private val onPref = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        runOnUiThread {
            when {
                key?.startsWith("ix_") == true -> Feed.entries.firstOrNull { "ix_" + it.key == key }?.let { drawCard(it, true) }
                key?.startsWith("ed_") == true -> { shown.clear(); sync() }
                else -> sync()
            }
        }
    }

    override fun onResume() { super.onResume(); Store.sp(this).registerOnSharedPreferenceChangeListener(onPref); shown.clear(); sync() }
    override fun onPause() { Store.sp(this).unregisterOnSharedPreferenceChangeListener(onPref); super.onPause() }

    private fun sync() {
        Feed.entries.forEach { drawCard(it, false) }
        notifySwitch.isChecked = notifyOn && Notifier.allowed(this)
        feedBtn.text = "알림에 먼저 띄울 지면 · " + (if (notifyFeed == Feed.BRIEFING) "브리핑" else "이머징")
        feedBtn.visibility = if (notifySwitch.isChecked) View.VISIBLE else View.GONE
        val parts = Feed.entries.mapNotNull { f ->
            val e = Store.edition(this, f) ?: return@mapNotNull null
            "${e.head} · ${e.cards.size}장 · 확인 " + DateFormat.format("M.d HH:mm", Store.fetchedAt(this, f))
        }
        status.text = if (parts.isEmpty()) "아직 받은 판이 없습니다." else parts.joinToString("\n") + "\n세 시간마다 새 판을 확인합니다."
    }

    private fun setNotify(on: Boolean) {
        if (on && !Notifier.allowed(this) && Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            return
        }
        notifyOn = on; notifyHidden = ""
        Notifier.show(this); sync()
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<out String>, r: IntArray) {
        val ok = Notifier.allowed(this)
        notifyOn = ok
        if (!ok) Toast.makeText(this, "알림 권한이 꺼져 있어 띄울 수 없습니다. «알림 설정 열기»에서 켜 주세요.", Toast.LENGTH_LONG).show()
        Notifier.show(this); sync()
    }

    private fun pin(f: Feed) {
        val m = getSystemService(AppWidgetManager::class.java)
        if (m.isRequestPinAppWidgetSupported) m.requestPinAppWidget(ComponentName(this, Render.provider(f)), null, null)
        else Toast.makeText(this, "홈 화면 빈 곳을 길게 누르고 «위젯» › «자료실 위젯»에서 고르세요.", Toast.LENGTH_LONG).show()
    }

    private fun refresh() {
        status.text = "받는 중…"
        Thread {
            val ok = Fetcher.refreshAll(this)
            runOnUiThread {
                Render.all(this); shown.clear(); sync()
                if (!ok) Toast.makeText(this, "일부를 받지 못했습니다. 인터넷 연결을 확인해 주세요.", Toast.LENGTH_SHORT).show()
            }
        }.start()
    }

    private fun text(s: String, size: Float, c: Int, bold: Boolean = false, cond: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color(c))
        setLineSpacing(0f, 1.2f)
        typeface = when {
            cond -> Typeface.create("sans-serif-condensed", Typeface.BOLD)
            bold -> Typeface.DEFAULT_BOLD
            else -> Typeface.DEFAULT
        }
    }

    private fun panel() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18f), dp(14f), dp(18f), dp(18f))
        background = GradientDrawable().apply { cornerRadius = dp(22f).toFloat(); setColor(color(R.color.app_card)); setStroke(dp(1f), color(R.color.app_line)) }
    }

    private fun button(s: String, on: () -> Unit) = Button(this).apply {
        text = s; isAllCaps = false; textSize = 15f
        setTextColor(color(R.color.ink))
        minHeight = dp(50f); gravity = Gravity.CENTER
        stateListAnimator = null
        background = GradientDrawable().apply { cornerRadius = dp(25f).toFloat(); setColor(color(R.color.app_card)); setStroke(dp(1f), color(R.color.app_line)) }
        setOnClickListener { on() }
    }

    private fun lp(top: Float) = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) }
}
