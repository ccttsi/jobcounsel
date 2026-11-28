package dev.witw.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** 자료실의 두 지면. 데이터 주소는 사이트가 이미 공개하는 data 폴더의 json — 읽기만 한다. */
enum class Feed(val key: String, val label: String, val page: String, val json: String) {
    BRIEFING("briefing", "브리핑", "https://witw.pages.dev/briefing/", "https://witw.pages.dev/briefing/data/briefing.json"),
    EMERGING("emerging", "이머징", "https://witw.pages.dev/emerging/", "https://witw.pages.dev/emerging/data/emerging.json");

    fun other() = if (this == BRIEFING) EMERGING else BRIEFING

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key } ?: BRIEFING
    }
}

/** 위젯·알림이 보여 주는 한 장. 비어 있는 칸은 화면에서 통째로 숨긴다. */
data class Card(
    val cat: String,
    val title: String,
    val sub: String,
    val text: String,
    val num: String,
    val numLabel: String,
    val link: String,
) {
    fun toJson() = JSONObject().put("c", cat).put("t", title).put("s", sub).put("x", text)
        .put("n", num).put("nl", numLabel).put("l", link)

    companion object {
        fun from(o: JSONObject) = Card(
            o.optString("c"), o.optString("t"), o.optString("s"), o.optString("x"),
            o.optString("n"), o.optString("nl"), o.optString("l"),
        )
    }
}

/** 오늘 판 하나만 보관한다. 새 판이 오면 덮어쓴다(지난 판을 쌓지 않는다). */
class Edition(val feed: Feed, val date: String, val head: String, val cards: List<Card>)

object Store {
    private fun sp(c: Context) = c.getSharedPreferences("witw", Context.MODE_PRIVATE)

    fun edition(c: Context, f: Feed): Edition? {
        val raw = sp(c).getString("ed_" + f.key, null) ?: return null
        return try {
            val o = JSONObject(raw)
            val a = o.getJSONArray("cards")
            Edition(f, o.optString("date"), o.optString("head"), (0 until a.length()).map { Card.from(a.getJSONObject(it)) })
        } catch (e: Exception) { null }
    }

    fun save(c: Context, e: Edition) {
        val a = JSONArray(); e.cards.forEach { a.put(it.toJson()) }
        val o = JSONObject().put("date", e.date).put("head", e.head).put("cards", a)
        val prev = edition(c, e.feed)
        sp(c).edit().apply {
            putString("ed_" + e.feed.key, o.toString())
            if (prev?.date != e.date) putInt("ix_" + e.feed.key, 0)   // 새 판은 표지부터
            putLong("at_" + e.feed.key, System.currentTimeMillis())
        }.apply()
    }

    fun index(c: Context, f: Feed): Int = sp(c).getInt("ix_" + f.key, 0)
    fun setIndex(c: Context, f: Feed, i: Int) = sp(c).edit().putInt("ix_" + f.key, i).apply()
    fun fetchedAt(c: Context, f: Feed): Long = sp(c).getLong("at_" + f.key, 0)

    var Context.notifyOn: Boolean
        get() = sp(this).getBoolean("notify", false)
        set(v) = sp(this).edit().putBoolean("notify", v).apply()
    var Context.notifyFeed: Feed
        get() = Feed.of(sp(this).getString("notify_feed", "briefing"))
        set(v) = sp(this).edit().putString("notify_feed", v.key).apply()
    var Context.notifyHidden: String
        get() = sp(this).getString("notify_hidden", "") ?: ""
        set(v) = sp(this).edit().putString("notify_hidden", v).apply()
}

object Fetcher {
    private fun get(url: String): String {
        val u = URL(url + "?t=" + System.currentTimeMillis() / 600000)   // 10분 단위로만 캐시를 비켜 간다
        val con = u.openConnection() as HttpURLConnection
        con.connectTimeout = 15000; con.readTimeout = 20000
        con.setRequestProperty("Accept", "application/json")
        con.setRequestProperty("User-Agent", "WitwWidget/1.0 (Android)")
        try {
            if (con.responseCode !in 200..299) throw IllegalStateException("HTTP " + con.responseCode)
            return con.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally { con.disconnect() }
    }

    fun fetch(f: Feed): Edition = when (f) {
        Feed.BRIEFING -> briefing(JSONObject(get(f.json)))
        Feed.EMERGING -> emerging(JSONObject(get(f.json)))
    }

    private fun firstNum(a: JSONArray?): Pair<String, String> {
        val o = a?.optJSONObject(0) ?: return "" to ""
        val v = o.optString("value_text").ifBlank { o.optString("value") }
        return v to o.optString("label")
    }

    private fun shortDate(d: String, wd: String): String {
        val p = d.split("-")
        return if (p.size == 3) "${p[1].toInt()}.${p[2].toInt()}" + (if (wd.isNotBlank()) " $wd" else "") else d
    }

    fun briefing(d: JSONObject): Edition {
        val ed = d.optJSONObject("edition") ?: JSONObject()
        val date = ed.optString("date")
        val head = "브리핑 · " + shortDate(date, ed.optString("weekday"))
        val list = mutableListOf<Card>()
        val (hn, hl) = firstNum(d.optJSONArray("headline_metrics"))
        list += Card("오늘의 한 장", ed.optString("title"), ed.optString("subtitle"),
            d.optJSONArray("cards")?.let { a -> (0 until a.length()).joinToString("\n") { "· " + a.getJSONObject(it).optString("title") } } ?: "",
            hn, hl, Feed.BRIEFING.page)
        val a = d.optJSONArray("cards") ?: JSONArray()
        val cards = (0 until a.length()).map { a.getJSONObject(it) }.sortedBy { it.optInt("order", 99) }
        for (c in cards) {
            val (n, nl) = firstNum(c.optJSONArray("key_numbers"))
            list += Card(
                c.optString("category"), c.optString("title"), c.optString("kicker"),
                c.optJSONObject("three_step")?.optString("what") ?: "",
                n, nl, Feed.BRIEFING.page + "#" + c.optString("id"),
            )
        }
        return Edition(Feed.BRIEFING, date, head, list)
    }

    fun emerging(d: JSONObject): Edition {
        val ed = d.optJSONObject("edition") ?: JSONObject()
        val date = ed.optString("date")
        val no = ed.optInt("no", 0)
        val head = "이머징" + (if (no > 0) " 제${no}호" else "") + " · " + shortDate(date, ed.optString("weekday"))
        val cats = HashMap<String, String>()
        d.optJSONArray("categories")?.let { a -> for (i in 0 until a.length()) a.getJSONObject(i).let { cats[it.optString("id")] = it.optString("name") } }
        val a = d.optJSONArray("items") ?: JSONArray()
        val items = (0 until a.length()).map { a.getJSONObject(it) }
            .filter { it.optString("date") == date }.sortedBy { it.optInt("order", 99) }
        val list = mutableListOf<Card>()
        list += Card("오늘의 신산업", ed.optString("title"), "",
            items.joinToString("\n") { "· " + it.optString("title") }, "", "", Feed.EMERGING.page)
        items.forEachIndexed { i, it ->
            val (n, nl) = firstNum(it.optJSONArray("key_numbers"))
            list += Card(
                cats[it.optString("cat")] ?: "", it.optString("title"), it.optString("subtitle"),
                it.optString("summary"), n, nl, Feed.EMERGING.page + "#i" + (i + 1),
            )
        }
        return Edition(Feed.EMERGING, date, head, list)
    }

    /** 두 지면을 받아 저장한다. 한쪽이 실패해도 다른 쪽은 저장하고, 실패한 쪽은 어제 판을 그대로 둔다. */
    fun refreshAll(c: Context): Boolean {
        var ok = true
        for (f in Feed.entries) {
            try {
                val e = fetch(f)
                if (e.cards.size > 1) Store.save(c, e) else ok = false
            } catch (e: Exception) { ok = false }
        }
        return ok
    }
}
