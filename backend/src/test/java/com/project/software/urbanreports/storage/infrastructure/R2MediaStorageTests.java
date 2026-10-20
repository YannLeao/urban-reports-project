package com.project.software.urbanreports.storage.infrastructure;

import com.project.software.urbanreports.storage.application.ImageStorageException;
import java.io.*;
import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class R2MediaStorageTests {
    R2StorageProperties properties = new R2StorageProperties(URI.create("https://synthetic.invalid"),"auto","synthetic","synthetic","synthetic");
    @Test void forwardsHeadAndExactRangeAndAbortsWithoutDraining() throws Exception {
        var s3 = mock(S3Client.class); var storage = new R2ImageStorage(s3,properties);
        when(s3.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder().contentLength(10L).contentType("video/mp4").build());
        assertThat(storage.head("opaque").size()).isEqualTo(10);
        var head = ArgumentCaptor.forClass(HeadObjectRequest.class); verify(s3).headObject(head.capture());
        assertThat(head.getValue().bucket()).isEqualTo("synthetic"); assertThat(head.getValue().key()).isEqualTo("opaque");
        @SuppressWarnings("unchecked") ResponseInputStream<GetObjectResponse> response = mock(ResponseInputStream.class);
        when(response.response()).thenReturn(GetObjectResponse.builder().contentLength(3L).contentRange("bytes 2-4/10").contentType("video/mp4").build());
        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(response);
        var handle = storage.open("opaque",2L,4L); assertThat(handle.input()).isSameAs(response); handle.abort();
        verify(response).abort(); verify(response,never()).close(); verify(response,never()).read();
        var get = ArgumentCaptor.forClass(GetObjectRequest.class); verify(s3).getObject(get.capture());
        assertThat(get.getValue().range()).isEqualTo("bytes=2-4");
    }
    @Test void rejectsProviderIgnoringRangeAndSanitizesFailure() {
        var s3 = mock(S3Client.class); var storage = new R2ImageStorage(s3,properties);
        @SuppressWarnings("unchecked") ResponseInputStream<GetObjectResponse> response = mock(ResponseInputStream.class);
        when(response.response()).thenReturn(GetObjectResponse.builder().contentLength(10L).build());
        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(response);
        assertThatThrownBy(() -> storage.open("opaque",2L,4L)).isInstanceOf(ImageStorageException.class).hasMessage("Media stream unavailable");
        verify(response).abort();
    }
    @Test void knownLengthProviderReopensAndClosesStreamsWithoutWholeFileBuffer() throws Exception {
        var s3 = mock(S3Client.class); var storage = new R2ImageStorage(s3,properties);
        AtomicInteger opens = new AtomicInteger(), closes = new AtomicInteger();
        when(s3.putObject(any(PutObjectRequest.class),any(RequestBody.class))).thenAnswer(invocation -> {
            RequestBody body = invocation.getArgument(1);
            assertThat(body.optionalContentLength()).contains(26214400L);
            var first = body.contentStreamProvider().newStream(); assertThat(first.read()).isEqualTo(3);
            var second = body.contentStreamProvider().newStream(); assertThat(second).isNotSameAs(first);
            assertThat(closes).hasValue(1); assertThat(second.read()).isEqualTo(3);
            return PutObjectResponse.builder().build();
        });
        storage.storeAt("opaque",26214400,"video/mp4",() -> {
            opens.incrementAndGet(); return new ByteArrayInputStream(new byte[]{3}) { @Override public void close() { closes.incrementAndGet(); } };
        });
        assertThat(opens).hasValue(2); assertThat(closes).hasValue(2);
    }
}
