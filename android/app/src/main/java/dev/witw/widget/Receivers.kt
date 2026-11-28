package dev.witw.widget

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import dev.witw.widget.Store.notifyFeed
import dev.witw.widget.Store.notifyHidden

/** 위젯·알림 단추: 이전 / 다음 / 새로 받기 / 지면 바꾸기 / 밀어서 지움 */
class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val PREV = "dev.witw.widget.PREV"
        const val NEXT = "dev.witw.widget.NEXT"
        const val REFRESH = "dev.witw.widget.REFRESH"
        const val SWAP = "dev.witw.widget.SWAP"
        const val HIDE = "dev.witw.widget.HIDE"
    }

    override fun onReceive(c: Context, i: Intent) {
        val f = Feed.of(i.getStringExtra("feed"))
        when (i.action) {
            PREV, NEXT -> {
                val n = Store.edition(c, f)?.cards?.size ?: return
                val d = if (i.action == NEXT) 1 else -1
                Store.setIndex(c, f, ((Store.index(c, f) + d) % n + n) % n)   // 끝에서 처음으로 돈다
                Render.all(c)
            }
            SWAP -> { c.notifyFeed = f.other(); Render.all(c) }
            HIDE -> { Store.edition(c, f)?.let { c.notifyHidden = f.key + ":" + it.date } }
            REFRESH -> {
                val p = goAsync()
                Thread {
                    try { Fetcher.refreshAll(c); Render.all(c) } finally { p.finish() }
                }.start()
            }
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (i.action != Intent.ACTION_BOOT_COMPLETED && i.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        RefreshJob.schedule(c)
        Render.all(c)
    }
}

/** 세 시간마다(인터넷이 될 때) 오늘 판을 확인한다. 바뀐 게 없으면 화면도 그대로다. */
class RefreshJob : JobService() {
    companion object {
        private const val PERIODIC = 1
        private const val ONCE = 2

        fun schedule(c: Context) {
            val js = c.getSystemService(JobScheduler::class.java)
            if (js.getPendingJob(PERIODIC) != null) return
            js.schedule(JobInfo.Builder(PERIODIC, ComponentName(c, RefreshJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(3 * 60 * 60 * 1000L, 60 * 60 * 1000L)
                .setPersisted(true)
                .build())
        }

        fun now(c: Context) {
            c.getSystemService(JobScheduler::class.java).schedule(
                JobInfo.Builder(ONCE, ComponentName(c, RefreshJob::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .build())
        }
    }

    override fun onStartJob(p: JobParameters): Boolean {
        Thread {
            val before = Feed.entries.map { Store.edition(this, it)?.date }
            val ok = Fetcher.refreshAll(this)
            val after = Feed.entries.map { Store.edition(this, it)?.date }
            if (before != after) notifyHidden = ""   // 새 판이 오면 지웠던 알림도 다시 띄운다
            Render.all(this)
            jobFinished(p, !ok)
        }.start()
        return true
    }

    override fun onStopJob(p: JobParameters) = true
}
