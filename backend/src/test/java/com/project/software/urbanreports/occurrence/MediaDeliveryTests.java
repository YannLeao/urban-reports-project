package com.project.software.urbanreports.occurrence;

import com.project.software.urbanreports.storage.application.*;
import jakarta.servlet.AsyncEvent;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.web.*;
import static org.assertj.core.api.Assertions.*;

class MediaDeliveryTests {
    static class Source implements ImageStorage {
        final CountDownLatch entered = new CountDownLatch(4), aborted = new CountDownLatch(1);
        final AtomicInteger heads = new AtomicInteger(), aborts = new AtomicInteger();
        public StoredImage store(InputStream i,long n,String t) { throw new AssertionError(); }
        public StoredImageContent load(String key) { throw new AssertionError("Video must not materialize"); }
        public Metadata head(String key) { heads.incrementAndGet(); return new Metadata(26214400, "video/mp4"); }
        public MediaObject open(String key,Long start,Long end) {
            return new MediaObject() {
                private final CountDownLatch stop = new CountDownLatch(1);
                public InputStream input() { return new InputStream() {
                    public int read() throws IOException { throw new AssertionError(); }
                    public int read(byte[] b,int off,int len) throws IOException {
                        assertThat(len).isLessThanOrEqualTo(16384); entered.countDown();
                        try { stop.await(5,TimeUnit.SECONDS); } catch(InterruptedException e) { Thread.currentThread().interrupt(); }
                        throw new IOException("synthetic-secret-provider-output");
                    }
                }; }
                public void abort() { aborts.incrementAndGet(); stop.countDown(); aborted.countDown(); }
                public void close() { abort(); }
            };
        }
    }
    @Test void saturationAndAsyncTimeoutAbortWithoutAppendingJsonAndReleaseCapacity() throws Exception {
        var source = new Source(); var beans = new DefaultListableBeanFactory(); beans.registerSingleton("storage",source);
        var delivery = new MediaDelivery(beans.getBeanProvider(ImageStorage.class));
        var ref = new MediaAccess.Reference("synthetic", "VIDEO", 26214400L);
        var requests = new java.util.ArrayList<MockHttpServletRequest>();
        var responses = new java.util.ArrayList<MockHttpServletResponse>();
        try {
            for (int i=0;i<4;i++) {
                var request = new MockHttpServletRequest("GET","/media"); request.setAsyncSupported(true);
                var response = new MockHttpServletResponse(); requests.add(request); responses.add(response);
                delivery.deliver(ref,request,response);
            }
            assertThat(source.entered.await(5,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> delivery.deliver(ref,new MockHttpServletRequest(),new MockHttpServletResponse())).hasMessage("MEDIA_BUSY");
            assertThat(source.heads).hasValue(4);
            for(var request:requests) {
                var context = (MockAsyncContext)request.getAsyncContext();
                for(var listener:context.getListeners()) listener.onTimeout(new AsyncEvent(context));
            }
            assertThat(source.aborted.await(5,TimeUnit.SECONDS)).isTrue();
            for(var response:responses) assertThat(response.getContentAsByteArray()).isEmpty();
        } finally { delivery.shutdown(); }
    }
    @Test void headAndUnsatisfiableDoNotOpenObjectAndIgnoreRangeOnHead() throws Exception {
        var source = new Source(); var beans = new DefaultListableBeanFactory(); beans.registerSingleton("storage",source);
        var delivery = new MediaDelivery(beans.getBeanProvider(ImageStorage.class));
        try {
            var head = new MockHttpServletRequest("HEAD","/media"); head.addHeader("Range","bytes=99-100");
            var response = new MockHttpServletResponse(); delivery.deliver(new MediaAccess.Reference("x","VIDEO",26214400L),head,response);
            assertThat(response.getStatus()).isEqualTo(200); assertThat(response.getContentLengthLong()).isEqualTo(26214400);
            var request = new MockHttpServletRequest("GET","/media"); request.addHeader("Range","bytes=999999999-");
            response = new MockHttpServletResponse(); delivery.deliver(new MediaAccess.Reference("x","VIDEO",26214400L),request,response);
            assertThat(response.getStatus()).isEqualTo(416); assertThat(response.getHeader("Content-Range")).isEqualTo("bytes */26214400");
            assertThat(source.aborts).hasValue(0);
        } finally { delivery.shutdown(); }
    }
}
