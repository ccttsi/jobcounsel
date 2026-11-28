package dev.witw.widget

import android.Manifest
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import dev.witw.widget.Store.notifyFeed
import dev.witw.widget.Store.notifyHidden
import dev.witw.widget.Store.notifyOn

/** 설정 한 장: 미리보기 · 홈 화면에 놓기 · 알림창/잠금화면 켜기 · 지금 새로 받기 */
class MainActivity : Activity() {
    private lateinit var col: LinearLayout
    private lateinit var status: TextView
    private lateinit var notifySwitch: Switch
    private lateinit var feedBtn: Button
    private val previews = HashMap<Feed, FrameLayout>()

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()
    private fun color(id: Int) = getColor(id)

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        Notifier.channel(this)
        RefreshJob.schedule(this)

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20f), dp(20f), dp(20f), dp(28f))
        }
        val scroll = ScrollView(this).apply { fitsSystemWindows = true; addView(col) }
        setContentView(scroll)

        col.addView(text("자료실 위젯", 22f, R.color.ink, bold = true))
        col.addView(text("오늘의 브리핑과 이머징 인더스트리를 홈 화면·알림창·잠금화면에서 한 장씩 넘겨 봅니다. 카드를 누르면 자료실의 그 자리가 열립니다.", 14f, R.color.muted).also { it.setPadding(0, dp(6f), 0, dp(14f)) })

        for (f in Feed.entries) {
            col.addView(text(if (f == Feed.BRIEFING) "오늘 브리핑" else "이머징 인더스트리", 13f, R.color.muted, bold = true).also { it.setPadding(0, dp(10f), 0, dp(6f)) })
            val box = FrameLayout(this)
            col.addView(box, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(190f)))
            previews[f] = box
            col.addView(button("홈 화면에 놓기") { pin(f) }, lp(top = 8f))
        }

        col.addView(divider())
        notifySwitch = Switch(this).apply {
            text = "알림창·잠금화면에 띄우기"
            textSize = 16f
            setTextColor(color(R.color.ink))
            minHeight = dp(48f)
            isChecked = notifyOn && Notifier.allowed(this@MainActivity)
            setOnCheckedChangeListener { _, on -> setNotify(on) }
        }
        col.addView(notifySwitch)
        feedBtn = button("") {
            notifyFeed = notifyFeed.other(); notifyHidden = ""; Render.all(this); sync()
        }
        col.addView(feedBtn, lp(top = 6f))
        col.addView(text("잠금화면에 내용까지 보이게 하려면 설정 › 잠금화면 › 알림에서 «내용 표시»를 고르세요.", 13f, R.color.muted).also { it.setPadding(0, dp(10f), 0, 0) })
        col.addView(button("알림 설정 열기") {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }, lp(top = 8f))

        col.addView(divider())
        col.addView(button("지금 새로 받기") { refresh() })
        status = text("", 13f, R.color.muted).also { it.setPadding(0, dp(10f), 0, 0) }
        col.addView(status)

        if (Store.edition(this, Feed.BRIEFING) == null) refresh()
    }

    /* 미리보기의 ◀ ▶ 를 누르거나 새 판이 오면 저장값이 바뀐다 — 그때 화면도 다시 그린다. */
    private val onPref = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> runOnUiThread { sync() } }

    override fun onResume() { super.onResume(); Store.sp(this).registerOnSharedPreferenceChangeListener(onPref); sync() }
    override fun onPause() { Store.sp(this).unregisterOnSharedPreferenceChangeListener(onPref); super.onPause() }

    private fun sync() {
        for ((f, box) in previews) {
            box.removeAllViews()
            val rv = Render.preview(this, f)
            box.addView(rv.apply(this, box))
        }
        notifySwitch.isChecked = notifyOn && Notifier.allowed(this)
        feedBtn.text = "알림에 먼저 띄울 지면: " + (if (notifyFeed == Feed.BRIEFING) "브리핑" else "이머징") + " (눌러서 바꾸기)"
        feedBtn.visibility = if (notifySwitch.isChecked) View.VISIBLE else View.GONE
        val parts = Feed.entries.mapNotNull { f ->
            val e = Store.edition(this, f) ?: return@mapNotNull null
            val at = Store.fetchedAt(this, f)
            "${e.head} · ${e.cards.size}장 · 확인 " + DateFormat.format("M.d HH:mm", at)
        }
        status.text = if (parts.isEmpty()) "아직 받은 판이 없습니다." else parts.joinToString("\n") + "\n세 시간마다 새 판을 확인합니다."
    }

    private fun setNotify(on: Boolean) {
        if (on && !Notifier.allowed(this) && android.os.Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            return
        }
        notifyOn = on; notifyHidden = ""
        Render.all(this); sync()
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<out String>, r: IntArray) {
        val ok = Notifier.allowed(this)
        notifyOn = ok
        if (!ok) Toast.makeText(this, "알림 권한이 꺼져 있어 띄울 수 없습니다. «알림 설정 열기»에서 켜 주세요.", Toast.LENGTH_LONG).show()
        Render.all(this); sync()
    }

    private fun pin(f: Feed) {
        val m = getSystemService(AppWidgetManager::class.java)
        if (m.isRequestPinAppWidgetSupported) {
            m.requestPinAppWidget(ComponentName(this, Render.provider(f)), null, null)
        } else {
            Toast.makeText(this, "홈 화면 빈 곳을 길게 누르고 «위젯» › «자료실 위젯»에서 고르세요.", Toast.LENGTH_LONG).show()
        }
    }

    private fun refresh() {
        status.text = "받는 중…"
        Thread {
            val ok = Fetcher.refreshAll(this)
            runOnUiThread {
                Render.all(this); sync()
                if (!ok) Toast.makeText(this, "일부를 받지 못했습니다. 인터넷 연결을 확인해 주세요.", Toast.LENGTH_SHORT).show()
            }
        }.start()
    }

    private fun text(s: String, size: Float, c: Int, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color(c))
        setLineSpacing(0f, 1.2f)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun button(s: String, on: () -> Unit) = Button(this).apply {
        text = s; isAllCaps = false; textSize = 15f
        setTextColor(color(R.color.ink))
        minHeight = dp(48f); gravity = Gravity.CENTER
        stateListAnimator = null
        background = GradientDrawable().apply {
            cornerRadius = dp(14f).toFloat(); setColor(color(R.color.soft)); setStroke(dp(1f), color(R.color.line))
        }
        setOnClickListener { on() }
    }

    private fun lp(top: Float) = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) }

    private fun divider() = View(this).apply {
        setBackgroundColor(color(R.color.line))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1f)).apply { topMargin = dp(22f); bottomMargin = dp(16f) }
    }
}
